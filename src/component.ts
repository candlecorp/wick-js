import {
  OperationList,
  WasmRsInstance,
  WasmRsModule,
  WasmRsTransport,
  WorkerClientTransport,
} from 'wasmrs-js';
import { Invokable } from './wick.js';
import { Observable, concatMap, map, of } from 'rxjs';
import {
  Packet,
  WickMetadata,
  SetupPayload,
  ContextPacket,
  ContextTransport,
} from './packet.js';
import {
  RSocket,
  RSocketConnector,
  Payload,
  ClientTransport,
} from 'rsocket-core';
import * as rx from '@candlecorp/rsocket-adapter-rxjs';
import { MESSAGEPACK_CODEC } from './codec.js';
import { debug } from './debug.js';
import { wasi } from 'wasmrs-js';
import { WasiOptions } from 'wasmrs-js/dist/src/wasi.js';
import { Signature, decodeClaims } from './claims.js';

export interface WasmRsOptions {
  wasi?: wasi.WasiOptions;
  workerUrl: string | URL;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeWasmTransport(instance: WasmRsInstance): ClientTransport {
  return new WasmRsTransport({
    instance,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeWorkerTransport(
  module: WasmRsModule,
  workerUrl: string | URL,
  wasi?: wasi.WasiOptions
): ClientTransport {
  return new WorkerClientTransport({
    workerUrl,
    module,
    wasi,
  });
}

function extractSignature(mod: WasmRsModule): Signature {
  const customSection = mod.customSection('wick/claims@v1');
  try {
    const claims = decodeClaims(customSection[0]);
    return claims.wascap.interface;
  } catch (e) {
    console.warn(
      'failed to decode claims, this will be an error in the future',
      e
    );
    return {
      name: 'unknown',
      format: -1,
      metadata: {
        version: 'unknown',
      },
      operations: [],
    };
  }
}

export class WasmRsComponent {
  readonly signature: Signature;
  constructor(
    private instance: WasmRsInstance,
    signature: Signature,
    private connection: RSocket
  ) {
    this.signature = signature;
  }

  get operations(): OperationList {
    return this.instance.operations;
  }

  rsocket(): RSocket {
    return this.connection;
  }

  async instantiate(
    config: SetupPayload = {}
  ): Promise<WasmRsComponentInstance> {
    const instance = new WasmRsComponentInstance(this, config);
    await instance.initialized();
    return instance;
  }

  static async FromBytes(
    bytes: ArrayBuffer,
    opts: WasmRsOptions
  ): Promise<WasmRsComponent> {
    const mod = await WasmRsModule.compile(bytes);
    const signature = extractSignature(mod);

    let limitedWasi: WasiOptions | undefined;
    if (opts.wasi) {
      limitedWasi = {
        version: opts.wasi.version,
        stdin: opts.wasi.stdin,
        stdout: opts.wasi.stdout,
        stderr: opts.wasi.stderr,
      };
    }
    const instance = await mod.instantiate({ wasi: limitedWasi });
    const connector = new RSocketConnector({
      setup: {
        keepAlive: 10000,
        lifetime: 20 * 1000,
      },
      transport: makeWorkerTransport(mod, opts.workerUrl, opts.wasi),
    });

    return new WasmRsComponent(instance, signature, await connector.connect());
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async FromResponse(
    response: Response,
    opts: WasmRsOptions
  ): Promise<WasmRsComponent> {
    const mod = await WasmRsModule.compileStreaming(response);
    const signature = extractSignature(mod);

    let limitedWasi: WasiOptions | undefined;
    if (opts.wasi) {
      limitedWasi = {
        version: opts.wasi.version,
        stdin: opts.wasi.stdin,
        stdout: opts.wasi.stdout,
        stderr: opts.wasi.stderr,
      };
    }
    const instance = await mod.instantiate({ wasi: limitedWasi });
    const connector = new RSocketConnector({
      setup: {
        keepAlive: 10000,
        lifetime: 20 * 1000,
      },
      transport: makeWorkerTransport(mod, opts.workerUrl, opts.wasi),
    });

    return new WasmRsComponent(instance, signature, await connector.connect());
  }

  terminate(): void {
    this.connection.close();
  }
}

export class WasmRsComponentInstance implements Invokable {
  private setupPromise;

  constructor(private component: WasmRsComponent, config?: SetupPayload) {
    this.setupPromise = this.setup(config);
  }

  async initialized(): Promise<void> {
    await this.setupPromise;
    debug('WasmRS component initialized');
  }

  async setup(config: SetupPayload = {}) {
    if (!config.imported) {
      config.imported = {};
    }
    if (!config.provided) {
      config.provided = {};
    }

    const payload: Payload = {
      data: MESSAGEPACK_CODEC.encode(config),
      metadata: Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]),
    };
    debug('WasmRS component sending setup request');
    return new Promise((res, rej) => {
      this.component.rsocket().requestResponse(payload, {
        onError: (error) => {
          debug('WasmRS component setup error', { error });
          rej(error);
        },
        onNext: (payload, isComplete) => {
          debug('WasmRS component setup complete', { payload, isComplete });
          res(payload);
        },
        onComplete: () => {},
        onExtension: () => {},
      });
    });
  }

  invoke(
    name: string,
    stream: Observable<Packet>,
    config: unknown = {}
  ): Observable<Packet> {
    const op = this.component.operations.getExport('wick', name);
    debug('invoking wasmRS component');
    const context: ContextTransport = {
      config,
      inherent: { seed: 0, timestamp: 0 },
    };
    const payloads = stream.pipe(
      concatMap((value, index) =>
        index === 0
          ? of(value).pipe(
              map((p) => new ContextPacket(op, p, context).intoPayload())
            )
          : of(value.intoPayload())
      )
    );

    const request = rx.RxRequestersFactory.requestChannelRaw(payloads);
    return request(this.component.rsocket()).pipe(
      map((v) => {
        let md = undefined;
        let port = '';
        if (v.metadata) {
          md = WickMetadata.decode(v.metadata);
          port = md.port;
        } else {
          debug('payload came in with no metadata');
          throw new Error('payload came in with no metadata');
        }
        return new Packet(port, v.data, 0);
      })
    );
  }
}

export class Component {
  static WasmRs = WasmRsComponent;
}

import { from } from 'rxjs';
import { Packet, Wick } from '../src/index.js';
import { decode, encode } from '@msgpack/msgpack';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { wasi } from 'wasmrs-js';
import DEBUG from 'debug';
const debug = DEBUG('wick');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('wick impl', () => {
  const file = path.join(__dirname, 'baseline.wick.wasm');

  test('dummy test to disable jest magic', async () => {
    expect(1).toBe(1);
  });

  test(`${file} requestChannel`, async () => {
    const wasiOpts: wasi.WasiOptions = {
      version: wasi.WasiVersions.SnapshotPreview1,
      args: [],
      env: { RUST_LOG: 'trace' },
      preopens: {
        '/sandbox': __dirname,
      },
      stdin: 0,
      stdout: 1,
      stderr: 2,
    };

    const bytes = await readFile(path.join(__dirname, 'baseline.wick.wasm'));
    const workerUrl = new URL(
      '../node_modules/wasmrs-js/dist/worker-node.esm.js',
      import.meta.url
    );
    debug('using worker from %s', workerUrl);

    const component = await Wick.Component.WasmRs.FromBytes(bytes, {
      workerUrl,
      wasi: wasiOpts,
    });
    console.log(component.operations);
    expect(component.operations.exports.length).toBe(
      component.signature.operations.length + 1
    );

    const instance = await component.instantiate({
      config: { default_err: 'test err' },
    });

    const stream = from([
      new Packet('left', encode(42)),
      new Packet('right', encode(32)),
    ]);
    const result = instance.invoke('add', stream);

    return new Promise((resolve, reject) => {
      let ok: boolean | null = null;

      result.subscribe({
        next(packet) {
          if (!packet.data) {
            return;
          }

          const value = decode(packet.data);
          console.log({ value });
          if (value === 42 + 32) {
            if (ok !== false) {
              ok = true;
            }
          } else {
            ok = false;
          }
        },
        complete() {
          console.log('done');
          if (ok) {
            resolve(null);
          } else {
            reject('not completed');
          }
          component.terminate();
        },
        error(err) {
          reject(err);
        },
      });
    });
  });
});

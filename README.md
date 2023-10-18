<!-- PROJECT LOGO -->
<br />
<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" width="50%" srcset="https://github.com/candlecorp/.github/blob/main/assets/wick_logo_light@.5.png?raw=true">
    <img alt="wick logo" width="50%" src="https://github.com/candlecorp/.github/blob/main/assets/wick_logo.png@.5.png?raw=true">
  </picture>

  <p align="center">
    A functional-reactive framework for WebAssembly components that run on the server and client.
  </p>
</div>



# wick-js

JavaScript implementation of a Wick host to run WebAssembly components.

Wick's WebAssembly components produce rxJS observables and can be used to delegate compute-intensive tasks easily to workers.

## Demo/Examples

Online demos of Wick in action:

- [Text generation](https://wasm.candle.dev/llama2)
- [Text redaction](https://wasm.candle.dev/redact)
- [Object detection](https://wasm.candle.dev/yolo)

Public repository of component examples:

- [Wick Components](https://github.com/candlecorp/wick-components/tree/main/components)

Wick's example directory:

- [Wick examples](https://github.com/candlecorp/wick/tree/main/examples)


## Installation

```bash
$ npm install @candlecorp/wick
```

## Usage 

Usage involves delegating to a worker to avoid holding up the main thread. The `wasmrs-js` package includes [ready-made workers](https://unpkg.com/browse/wasmrs-js@0.2.4/dist/) 
or you can create your own from the module files themselves if it works better for your environment. It can be as simple as a one-liner to make your own worker in your UI framework of choice ([example](https://github.com/candlecorp/wasm.candle.dev/blob/main/ui/src/lib/component-worker.js)).

```ts
import { from } from 'rxjs';
import { Packet, Wick } from '@candlecorp/wick';
import { decode, encode } from '@msgpack/msgpack';
import { wasi } from 'wasmrs-js';

const wasiOpts: wasi.WasiOptions = {
  version: wasi.WasiVersions.SnapshotPreview1,
  preopens: {
    '/': 'opfs:/',
  },
  stdin: 0,
  stdout: 1,
  stderr: 2,
};

const component = await Wick.Component.WasmRs.FromResponse(
  await fetch('component.wasm'),
  {
    workerUrl: new URL('path-to/worker.js'),
    wasi: wasiOpts,
  }
);

const instance = await component.instantiate({
  config: {
    /* any component configuration necessary*/
  },
});

const stream = from([
  new Packet('left', encode(42)),
  new Packet('right', encode(32)),
]);

instance.invoke('add', stream).subscribe({
  next(packet) {
    if (!packet.data) {
      return;
    }

    const value = decode(packet.data);
    console.log({ value });
  },
});
```

## License

Apache-2.0

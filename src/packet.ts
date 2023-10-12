import { Payload } from 'rsocket-core';
import { encode } from '@msgpack/msgpack';
import { fromU16Bytes, toU16Bytes, toU24Bytes } from './utils.js';
import { Operation } from 'wasmrs-js';
import { debug } from './debug.js';

export interface IntoPayload {
  intoPayload(): Payload;
}

export class ContextPacket implements IntoPayload {
  constructor(
    private operation: Operation,
    private packet: Packet,
    private context: ContextTransport
  ) {}
  intoPayload(): Payload {
    this.packet.setContext(this.context);
    const payload = this.packet.intoPayload();
    payload.metadata?.set(this.operation.asEncoded(), 4);
    console.log({ context_metadata: payload.metadata });
    debug('context packet %o', payload);
    return payload;
  }
}

export class Packet implements IntoPayload {
  data?: Uint8Array | null;
  port: string;
  context?: ContextTransport;
  flags: number = 0;

  constructor(port: string, data?: Uint8Array | null, flags: number = 0) {
    this.port = port;
    this.data = data;
    this.flags = flags;
  }

  static Done(port: string): Packet {
    return new Packet(port, undefined, WickFlags.DONE_FLAG);
  }

  static OpenBracket(port: string): Packet {
    return new Packet(port, undefined, WickFlags.OPEN_BRACKET);
  }

  static CloseBracket(port: string): Packet {
    return new Packet(port, undefined, WickFlags.CLOSE_BRACKET);
  }

  setFlags(flags: WickFlags) {
    this.flags = flags;
  }

  setContext(context: ContextTransport) {
    this.context = context;
  }

  intoPayload(): Payload {
    let contextBytes = new Uint8Array();
    if (this.context) {
      debug('packet context %o', this.context);
      contextBytes = encode(this.context);
    }
    const wickMetadata = new WickMetadata(0, this.port, contextBytes);
    const wickMetadataBytes = wickMetadata.encode();
    const metadata = new Uint8Array(4 + 8 + wickMetadataBytes.length);
    let index = 0;
    metadata[index++] = 0xca;
    metadata.set(toU24Bytes(8 + wickMetadataBytes.length), index);
    index += 3;
    metadata.set([0, 0, 0, 0, 0, 0, 0, 0], index);
    index += 8;
    metadata.set(wickMetadataBytes, index);
    debug('packet metadata %o', metadata);
    return {
      data: this.data ? Buffer.from(this.data) : undefined,
      metadata: Buffer.from(metadata),
    };
  }
}

export interface SetupPayload {
  config?: unknown;
  provided?: Record<string, ComponentReference>;
  imported?: Record<string, ComponentReference>;
}

export interface ContextTransport {
  config?: unknown;
  inherent: InherentData;
  invocation?: InvocationRequest;
}

export interface InvocationRequest {
  reference: ComponentReference;
  operation: string;
}

export interface ComponentReference {
  origin: string;
  target: string;
}

export interface InherentData {
  seed: number;
  timestamp: number;
}

export enum WickFlags {
  DONE_FLAG = 0b1000_0000,
  OPEN_BRACKET = 0b0100_0000,
  CLOSE_BRACKET = 0b0010_0000,
}

export class WickMetadata {
  flags: number;
  port: string;
  context?: Uint8Array;
  constructor(flags: number, port: string, context?: Uint8Array) {
    this.flags = flags;
    this.port = port;
    this.context = context;
  }

  encode(): Uint8Array {
    const nameBytes = new TextEncoder().encode(this.port);
    const configBytes = this.context || new Uint8Array();
    const length = 1 + 2 + nameBytes.length + 2 + configBytes.length;
    const buffer = new Uint8Array(length);
    let index = 0;
    buffer.set([this.flags % 256], index);
    index += 1;
    buffer.set(toU16Bytes(nameBytes.length), index);
    index += 2;
    buffer.set(nameBytes, index);
    index += nameBytes.length;
    buffer.set(toU16Bytes(configBytes.length), index);
    index += 2;
    if (configBytes.length) {
      buffer.set(configBytes, index);
    }

    return buffer;
  }

  static decode(buffer: Uint8Array): WickMetadata {
    let index = 0;
    if (buffer[0] == 0xca) {
      // new metadata format
      index += 4;
    }
    const flags = buffer[index++];
    const nameLen = fromU16Bytes(buffer.slice(index, index + 2));
    index += 2;
    const nameBytes = buffer.slice(index, index + nameLen);
    index += nameLen;
    const port = new TextDecoder().decode(nameBytes);
    const configLen = fromU16Bytes(buffer.slice(index, index + 2));
    index += 2;
    const configBytes = buffer.slice(index, index + configLen);
    const context = configBytes.length ? configBytes : undefined;
    return new WickMetadata(flags, port, context);
    // const nameBytes = buffer.slice(3, 3 + nameLen);
    // const port = new TextDecoder().decode(nameBytes);
    // const configLen = fromU16Bytes(buffer.slice(3 + nameLen, 5 + nameLen));
    // const configBytes = buffer.slice(5 + nameLen, 5 + nameLen + configLen);
    // const context = configBytes.length ? configBytes : undefined;
    // return new WickMetadata(flags, port, context);
  }
}

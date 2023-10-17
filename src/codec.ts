import { Codec } from 'rsocket-messaging';
import { decode, encode } from '@msgpack/msgpack';

export class MessagePackCodec implements Codec<unknown> {
  readonly mimeType: string = 'application/x-msgpack';

  decode(buffer: Buffer): unknown {
    return decode(buffer);
  }

  encode(entity: unknown): Buffer {
    return Buffer.from(encode(entity));
  }
}

export const MESSAGEPACK_CODEC = new MessagePackCodec();

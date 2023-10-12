export interface FileSystem {
  readBytes(path: string): Promise<Uint8Array | undefined>;
  writeBytes(path: string, contents: Uint8Array): Promise<void>;
}

export class InMemoryFs implements FileSystem {
  private entries: Map<string, Uint8Array> = new Map();

  constructor() {}
  async readBytes(path: string): Promise<Uint8Array | undefined> {
    return this.entries.get(path);
  }
  async writeBytes(path: string, contents: Uint8Array): Promise<void> {
    this.entries.set(path, contents);
  }
}

export let fs: FileSystem = new InMemoryFs();

export function setFileSystem(newFs: FileSystem) {
  fs = newFs;
}

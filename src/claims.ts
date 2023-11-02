export interface Claims {
  jti: string;
  iat: number;
  iss: string;
  sub: string;
  wascap: {
    hash: string;
    tags: string[];
    interface: Signature;
  };
}

export interface Signature {
  name: string;
  format: number;
  metadata: {
    version: string;
  };
  operations: OperationDefinition[];
}

export interface OperationDefinition {
  name: string;
  config: Field[];
  inputs: Field[];
  outputs: Field[];
}

export interface Field {
  name: string;
  type: string;
  required: boolean;
}

export function decodeClaims(buffer: ArrayBuffer): Claims {
  const decoded = new TextDecoder('utf-8').decode(buffer);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_header, claims] = decoded.split('.');
  if (claims) {
    return JSON.parse(atob(claims)) as Claims;
  } else {
    throw new Error('invalid module, no claims found');
  }
}

import { Component } from './component.js';
import { IntoPayload, Packet } from './packet.js';
import { Observable } from 'rxjs';

export class Wick {
  static Component = Component;
}

export interface Invokable {
  invoke(op: string, stream: Observable<IntoPayload>): Observable<Packet>;
}

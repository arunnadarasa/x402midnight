import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  anchorChunk(context: __compactRuntime.CircuitContext<PS>,
              chunkHash_0: Uint8Array,
              priceMicroUsdc_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  anchorChunk(context: __compactRuntime.CircuitContext<PS>,
              chunkHash_0: Uint8Array,
              priceMicroUsdc_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  anchorChunk(context: __compactRuntime.CircuitContext<PS>,
              chunkHash_0: Uint8Array,
              priceMicroUsdc_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  chunks: {
    isEmpty(): boolean;
    length(): bigint;
    head(): { is_some: boolean, value: Uint8Array };
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  buyers: {
    isEmpty(): boolean;
    length(): bigint;
    head(): { is_some: boolean, value: { bytes: Uint8Array } };
    [Symbol.iterator](): Iterator<{ bytes: Uint8Array }>
  };
  prices: {
    isEmpty(): boolean;
    length(): bigint;
    head(): { is_some: boolean, value: bigint };
    [Symbol.iterator](): Iterator<bigint>
  };
  readonly totalMicroUsdc: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;

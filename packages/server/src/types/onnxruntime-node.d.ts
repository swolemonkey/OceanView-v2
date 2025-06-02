declare module 'onnxruntime-node' {
  export interface InferenceSession {
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  }
  
  export const InferenceSession: {
    create(modelPath: string, options?: any): Promise<InferenceSession>;
  };
  
  export interface Tensor {
    data: Float32Array | Int32Array | Int8Array | number[];
    dims: number[];
    type: string;
  }
  
  export class Tensor {
    constructor(type: string, data: Float32Array | Int32Array | Int8Array | number[], dims: number[]);
  }
} 
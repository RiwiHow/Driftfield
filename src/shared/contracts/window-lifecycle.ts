export interface WindowCloseRequest {
  reason: 'close' | 'quit';
  requestId: string;
}

export interface CompleteWindowCloseRequest {
  proceed: boolean;
  requestId: string;
}

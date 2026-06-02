declare module "react-native-call-log" {
  export type CallLogFilter = {
    minTimestamp?: number;
    maxTimestamp?: number;
    phoneNumbers?: string | string[];
  };

  export type CallLogEntry = {
    phoneNumber: string;
    type: string;
    timestamp: string;
    dateTime: string;
    duration: number | string;
    name?: string;
    rawType?: number;
  };

  const CallLogs: {
    load(limit: number, filter?: CallLogFilter): Promise<CallLogEntry[]>;
    loadAll(): Promise<CallLogEntry[]>;
  };

  export default CallLogs;
}

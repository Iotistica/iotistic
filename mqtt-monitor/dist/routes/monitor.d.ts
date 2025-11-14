import { MQTTMonitorService } from '../services/mqtt-monitor';
import { MQTTDatabaseService } from '../services/mqtt-database-service';
declare const router: import("express-serve-static-core").Router;
export declare function setMonitorInstance(monitorInstance: MQTTMonitorService | null, dbService?: MQTTDatabaseService | null): void;
export default router;
//# sourceMappingURL=monitor.d.ts.map
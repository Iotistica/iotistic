/**
 * IFC Digital Twin Types
 */

export interface IFCNode {
  id: string; // IFC RefId (e.g., "EDGE01", "RM101")
  type: string; // IFC type (e.g., "IFCSPACE", "IFCSENSOR")
  name: string;
  description?: string;
  position?: { x: number; y: number; z: number };
  geometry?: any;
  children: IFCNode[];
  deviceUuid?: string; // Link to actual device in system
}

export interface IFCRelationship {
  id: string;
  type: string;
  source: string;
  target: string;
  label?: string;
}

export interface IFCModel {
  nodes: Map<string, IFCNode>;
  relationships: IFCRelationship[];
  root?: IFCNode;
}

export interface DeviceMapping {
  ifcRefId: string;
  deviceUuid: string;
  deviceName: string;
  status: 'online' | 'offline';
}

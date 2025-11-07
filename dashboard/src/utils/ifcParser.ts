/**
 * IFC File Parser
 * Parses IFC-STEP format and builds a graph model
 */

import { IFCNode, IFCModel, IFCRelationship } from '../types/ifc';

interface IFCEntity {
  id: string;
  type: string;
  attributes: any[];
}

export class IFCParser {
  private entities: Map<string, IFCEntity> = new Map();
  
  parse(ifcContent: string): IFCModel {
    this.entities.clear();
    
    // Extract entities from IFC file
    const dataSection = this.extractDataSection(ifcContent);
    this.parseEntities(dataSection);
    
    // Build node tree
    const nodes = new Map<string, IFCNode>();
    const relationships: IFCRelationship[] = [];
    
    // Create nodes from entities
    this.entities.forEach((entity, id) => {
      const node = this.createNode(entity);
      if (node) {
        nodes.set(id, node);
      }
    });
    
    // Process relationships
    this.entities.forEach((entity) => {
      if (entity.type === 'IFCRELAGGREGATES' || 
          entity.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' ||
          entity.type === 'IFCRELASSIGNSTOACTOR') {
        const rels = this.parseRelationship(entity, nodes);
        relationships.push(...rels);
      }
    });
    
    // Find root (IFCPROJECT)
    const root = Array.from(nodes.values()).find(n => n.type === 'IFCPROJECT');
    
    return { nodes, relationships, root };
  }
  
  private extractDataSection(content: string): string {
    const dataMatch = content.match(/DATA;([\s\S]*?)ENDSEC;/);
    return dataMatch ? dataMatch[1] : '';
  }
  
  private parseEntities(dataSection: string): void {
    // Match IFC entities: #123 = IFCTYPE(attributes);
    const entityRegex = /#(\d+)\s*=\s*([A-Z0-9]+)\((.*?)\);/gs;
    let match;
    
    while ((match = entityRegex.exec(dataSection)) !== null) {
      const [, id, type, attrString] = match;
      const attributes = this.parseAttributes(attrString);
      
      this.entities.set(`#${id}`, {
        id: `#${id}`,
        type,
        attributes
      });
    }
  }
  
  private parseAttributes(attrString: string): any[] {
    const attrs: any[] = [];
    let depth = 0;
    let current = '';
    let inString = false;
    
    for (let i = 0; i < attrString.length; i++) {
      const char = attrString[i];
      
      if (char === "'" && attrString[i - 1] !== '\\') {
        inString = !inString;
      }
      
      if (!inString) {
        if (char === '(') depth++;
        if (char === ')') depth--;
        
        if (char === ',' && depth === 0) {
          attrs.push(this.parseValue(current.trim()));
          current = '';
          continue;
        }
      }
      
      current += char;
    }
    
    if (current.trim()) {
      attrs.push(this.parseValue(current.trim()));
    }
    
    return attrs;
  }
  
  private parseValue(value: string): any {
    value = value.trim();
    
    // Null
    if (value === '$') return null;
    
    // Boolean
    if (value === '.T.') return true;
    if (value === '.F.') return false;
    
    // String
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1);
    }
    
    // Reference
    if (value.startsWith('#')) {
      return value;
    }
    
    // Number
    if (!isNaN(Number(value))) {
      return Number(value);
    }
    
    // Enum
    if (value.startsWith('.') && value.endsWith('.')) {
      return value.slice(1, -1);
    }
    
    // Tuple/Array
    if (value.startsWith('(') && value.endsWith(')')) {
      return this.parseAttributes(value.slice(1, -1));
    }
    
    return value;
  }
  
  private createNode(entity: IFCEntity): IFCNode | null {
    const [globalId, name, description] = entity.attributes;
    
    // Extract RefId from GlobalId (e.g., 'EDGE01')
    const refId = typeof globalId === 'string' ? globalId : entity.id;
    
    const node: IFCNode = {
      id: refId,
      type: entity.type,
      name: typeof name === 'string' ? name : refId,
      description: typeof description === 'string' ? description : undefined,
      children: []
    };
    
    // Extract position for spatial elements
    if (entity.type === 'IFCCARTESIANPOINT') {
      const coords = entity.attributes[0];
      if (Array.isArray(coords) && coords.length >= 2) {
        node.position = {
          x: coords[0] || 0,
          y: coords[1] || 0,
          z: coords[2] || 0
        };
      }
    }
    
    return node;
  }
  
  private parseRelationship(entity: IFCEntity, nodes: Map<string, IFCNode>): IFCRelationship[] {
    const relationships: IFCRelationship[] = [];
    
    if (entity.type === 'IFCRELAGGREGATES') {
      // [id, owner, name, desc, relatingObject, relatedObjects]
      const source = entity.attributes[4];
      const targets = entity.attributes[5];
      
      if (typeof source === 'string' && Array.isArray(targets)) {
        const sourceNode = this.findNodeByRef(source, nodes);
        targets.forEach(target => {
          if (typeof target === 'string') {
            const targetNode = this.findNodeByRef(target, nodes);
            if (sourceNode && targetNode) {
              sourceNode.children.push(targetNode);
              relationships.push({
                id: entity.id,
                type: 'AGGREGATES',
                source: sourceNode.id,
                target: targetNode.id,
                label: 'contains'
              });
            }
          }
        });
      }
    }
    
    if (entity.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
      // [id, owner, name, desc, relatedElements, relatingStructure]
      const elements = entity.attributes[4];
      const structure = entity.attributes[5];
      
      if (Array.isArray(elements) && typeof structure === 'string') {
        const structureNode = this.findNodeByRef(structure, nodes);
        elements.forEach(elem => {
          if (typeof elem === 'string') {
            const elemNode = this.findNodeByRef(elem, nodes);
            if (structureNode && elemNode) {
              structureNode.children.push(elemNode);
              relationships.push({
                id: entity.id,
                type: 'CONTAINS',
                source: structureNode.id,
                target: elemNode.id,
                label: 'contains'
              });
            }
          }
        });
      }
    }
    
    if (entity.type === 'IFCRELASSIGNSTOACTOR') {
      // [id, owner, name, desc, relatedObjects, relatingActor]
      const objects = entity.attributes[4];
      const actor = entity.attributes[5];
      
      if (Array.isArray(objects) && typeof actor === 'string') {
        const actorNode = this.findNodeByRef(actor, nodes);
        objects.forEach(obj => {
          if (typeof obj === 'string') {
            const objNode = this.findNodeByRef(obj, nodes);
            if (actorNode && objNode) {
              actorNode.children.push(objNode);
              relationships.push({
                id: entity.id,
                type: 'ASSIGNS',
                source: objNode.id,
                target: actorNode.id,
                label: 'connected to'
              });
            }
          }
        });
      }
    }
    
    return relationships;
  }
  
  private findNodeByRef(ref: string, nodes: Map<string, IFCNode>): IFCNode | undefined {
    // Try direct match first
    if (nodes.has(ref)) {
      return nodes.get(ref);
    }
    
    // Search by RefId in entity
    const entity = this.entities.get(ref);
    if (entity && entity.attributes[0]) {
      const refId = entity.attributes[0];
      if (typeof refId === 'string') {
        // Find node with matching id
        return Array.from(nodes.values()).find(n => n.id === refId);
      }
    }
    
    return undefined;
  }
}

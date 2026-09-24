const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      callback(dirPath);
    }
  });
}

function processIndexer() {
  const raffleEntityPath = path.join(ROOT, 'indexer/src/database/entities/raffle.entity.ts');
  if (fs.existsSync(raffleEntityPath)) {
    let content = fs.readFileSync(raffleEntityPath, 'utf8');
    content = content.replace(/export enum RaffleStatus \{[\s\S]*?\}/, 'import { Raffle, RaffleStatus } from "@tikka/types";\nexport { RaffleStatus };');
    content = content.replace(/export class RaffleEntity \{/g, 'export class RaffleEntity implements Raffle {');
    fs.writeFileSync(raffleEntityPath, content);
  }
  
  const userEntityPath = path.join(ROOT, 'indexer/src/database/entities/user.entity.ts');
  if (fs.existsSync(userEntityPath)) {
    let content = fs.readFileSync(userEntityPath, 'utf8');
    content = content.replace(/import \{.*?\} from "typeorm";/, '$&\nimport { User } from "@tikka/types";');
    content = content.replace(/export class UserEntity \{/g, 'export class UserEntity implements User {');
    fs.writeFileSync(userEntityPath, content);
  }

  const ticketEntityPath = path.join(ROOT, 'indexer/src/database/entities/ticket.entity.ts');
  if (fs.existsSync(ticketEntityPath)) {
    let content = fs.readFileSync(ticketEntityPath, 'utf8');
    content = content.replace(/import \{ RaffleEntity \} from "\.\/raffle\.entity";/, 'import { RaffleEntity } from "./raffle.entity";\nimport { Ticket } from "@tikka/types";');
    content = content.replace(/export class TicketEntity \{/g, 'export class TicketEntity implements Ticket {');
    fs.writeFileSync(ticketEntityPath, content);
  }
}

function processSdk() {
  const bindingsPath = path.join(ROOT, 'sdk/src/contract/bindings.ts');
  if (fs.existsSync(bindingsPath)) {
    let content = fs.readFileSync(bindingsPath, 'utf8');
    content = content.replace(/export enum RaffleStatus \{[\s\S]*?\}/, 'import { RaffleStatus } from "@tikka/types";\nexport { RaffleStatus };');
    fs.writeFileSync(bindingsPath, content);
  }

  const raffleTypesPath = path.join(ROOT, 'sdk/src/modules/raffle/raffle.types.ts');
  if (fs.existsSync(raffleTypesPath)) {
    let content = fs.readFileSync(raffleTypesPath, 'utf8');
    content = content.replace(/export interface RaffleData \{[\s\S]*?\}\n/, 'import { Pick } from "typescript";\nimport { Raffle } from "@tikka/types";\nexport type RaffleData = Pick<Raffle, "creator" | "status" | "ticketPrice" | "asset" | "maxTickets" | "ticketsSold" | "endTime" | "winner" | "winningTicketId" | "prizeAmount"> & { raffleId: number, allowMultiple: boolean, metadataCid: string, assetIssuer?: string };\n');
    fs.writeFileSync(raffleTypesPath, content);
  }
  
  // Replace enum mappings
  walkDir(path.join(ROOT, 'sdk/src'), (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    
    if (content.includes('RaffleStatus.Open')) {
      content = content.replace(/RaffleStatus\.Open/g, 'RaffleStatus.OPEN');
      changed = true;
    }
    if (content.includes('RaffleStatus.Drawing')) {
      content = content.replace(/RaffleStatus\.Drawing/g, 'RaffleStatus.DRAWING');
      changed = true;
    }
    if (content.includes('RaffleStatus.Finalized')) {
      content = content.replace(/RaffleStatus\.Finalized/g, 'RaffleStatus.FINALIZED');
      changed = true;
    }
    if (content.includes('RaffleStatus.Cancelled')) {
      content = content.replace(/RaffleStatus\.Cancelled/g, 'RaffleStatus.CANCELLED');
      changed = true;
    }
    
    // Status number mapping workaround for SDK parser
    if (filePath.includes('raffle.service.ts') || filePath.includes('raffle.read.service.ts')) {
      content = content.replace(/raw\.status \?\? raw\.Status \?\? 0/g, 'mapContractStatus(raw.status ?? raw.Status ?? 0)');
      if (content.includes('mapContractStatus') && !content.includes('function mapContractStatus')) {
        content = `import { RaffleStatus } from "@tikka/types";\nfunction mapContractStatus(status: number): RaffleStatus {\n  switch(status) {\n    case 0: return RaffleStatus.OPEN;\n    case 1: return RaffleStatus.DRAWING;\n    case 2: return RaffleStatus.FINALIZED;\n    case 3: return RaffleStatus.CANCELLED;\n    default: return RaffleStatus.OPEN;\n  }\n}\n` + content;
      }
      changed = true;
    }
    
    if (changed) fs.writeFileSync(filePath, content);
  });
}

function processClient() {
  const vmPath = path.join(ROOT, 'client/src/components/cards/raffleCardViewModel.ts');
  if (fs.existsSync(vmPath)) {
    let content = fs.readFileSync(vmPath, 'utf8');
    content = content.replace(/export type RaffleStatus = .*?;/, 'export type CardStatus = "live" | "ending-soon" | "finalized" | "cancelled";');
    content = content.replace(/RaffleStatus/g, 'CardStatus');
    fs.writeFileSync(vmPath, content);
  }
  
  walkDir(path.join(ROOT, 'client/src'), (filePath) => {
    if (filePath === vmPath) return;
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('RaffleStatus')) {
      content = content.replace(/import.*?RaffleStatus.*?from ".*raffleCardViewModel";/g, 'import { CardStatus } from "./raffleCardViewModel";');
      content = content.replace(/RaffleStatus/g, 'CardStatus');
      fs.writeFileSync(filePath, content);
    }
  });
}

function processBackend() {
  const servicesPath = path.join(ROOT, 'backend/src/api/rest/raffles/services.ts');
  if (fs.existsSync(servicesPath)) {
    let content = fs.readFileSync(servicesPath, 'utf8');
    content = content.replace(/export interface Raffle \{[\s\S]*?\}/, 'import { Raffle } from "@tikka/types";');
    
    // Fix dbMock data to match new Raffle type
    content = content.replace(/id: Math\.random\(\)\.toString\(36\)\.substring\(7\),/g, 'id: Math.floor(Math.random() * 1000000),');
    content = content.replace(/ticketPrice,/g, 'ticketPrice: ticketPrice.toString(), asset: "XLM", maxTickets: 100, ticketsSold: 0, endTime: Date.now() + 86400000, winner: null, winningTicketId: null, prizeAmount: null, createdLedger: 0, finalizedLedger: null, metadataCid: null, creator: "mock",');
    content = content.replace(/status: 'active'/g, 'status: "open" as any');
    content = content.replace(/status: 'completed'/g, 'status: "finalized" as any');
    content = content.replace(/status: 'paused'/g, 'status: "cancelled" as any');
    content = content.replace(/'active' \| 'completed' \| 'paused'/g, 'any');
    
    fs.writeFileSync(servicesPath, content);
  }
}

function processOracle() {
  const contractServicePath = path.join(ROOT, 'oracle/src/contract/contract.service.ts');
  if (fs.existsSync(contractServicePath)) {
    let content = fs.readFileSync(contractServicePath, 'utf8');
    content = content.replace(/export interface RaffleData \{[\s\S]*?\}/, 'import { Pick } from "typescript";\nimport { Raffle } from "@tikka/types";\nexport type RaffleData = Pick<Raffle, "status" | "prizeAmount"> & { raffleId: number };');
    fs.writeFileSync(contractServicePath, content);
  }
}

processIndexer();
processSdk();
processClient();
processBackend();
processOracle();

console.log('Types refactoring complete');

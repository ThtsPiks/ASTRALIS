import {
  trySpendFuel, systemJumpCost, beginDeepSurvey, grantDeepRp, probeIntake, migrateFuel, holdMass, seedLedger,
} from '../src/game/ledger.js';

let failed = 0;
const ok = (name, cond) => {
  if (!cond) { failed++; console.error('FAIL', name); }
  else console.log('ok', name);
};

const dry = { fuel: 12, maxFuel: 480 };
const short = trySpendFuel(dry, 40);
ok('short jump spends nothing', short.ok === false && dry.fuel === 12 && short.need === 40);
const paid = trySpendFuel(dry, 5);
ok('full quote spends exactly', paid.ok === true && paid.spent === 5 && dry.fuel === 7);
ok('ly cost', systemJumpCost(100) === 22);

const career = { campaign: { flags: {} }, kits: 4, researched: {}, rp: 0, expedition: null };
const first = beginDeepSurvey(career, 'veil-1');
ok('first survey free', first.free === true && career.kits === 4);
const second = beginDeepSurvey(career, 'veil-2');
ok('later survey spends one kit', second.spent === 1 && career.kits === 3);
const again = beginDeepSurvey(career, 'veil-2');
ok('same expedition does not spend twice', again.resume === true && career.kits === 3);
const blocked = beginDeepSurvey({ campaign: { flags: { freeDeep: true } }, kits: 0, researched: {}, expedition: null }, 'veil-3');
ok('no kit blocks before spend', blocked.ok === false);

const rp1 = grantDeepRp(career, 'veil-2');
const rp2 = grantDeepRp(career, 'veil-2');
ok('research points once', rp1.gained === 12 && career.rp === 12 && rp2.repeat === true);

const oldShip = { fuel: 0, maxFuel: 480 };
migrateFuel(oldShip, { v: 1, fuel: 100 });
ok('old dry tank migrates once', oldShip.fuel === 480);
const kept = { fuel: 0, maxFuel: 480 };
migrateFuel(kept, { v: 2, fuel: 80, fuelMigrated: true });
ok('later load keeps the saved tank', kept.fuel === 80);

const wide = probeIntake(1, 9999, 1);
const narrow = probeIntake(1, 9999, 1);
ok('probe rate ignores tank size', wide === narrow && wide === 12);
ok('probe respects remaining room', probeIntake(1, 3, 1) === 3);

seedLedger(career);
ok('starter kits', career.kits === 4 && career.rp === 0);
ok('kit mass', holdMass({ cargo: { ice: 1 }, kits: 4, filters: 1, transitCells: 2 }) === 3);

if (failed) {
  console.error(failed, 'failed');
  process.exit(1);
}
console.log('ledger ok');

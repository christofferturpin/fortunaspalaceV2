// Quick Node smoke test for the sailing sim. Loads modules in order
// and runs a default battle, printing the text report.
//
// Not part of the game — delete or move to tests/ if/when a test suite lands.

require('./world.js');
require('./ship.js');
require('./sail.js');
require('./physics.js');
require('./mapgen.js');
require('./combat.js');
require('./pathfind.js');
require('./controller.js');
require('./ai.js');
require('./sim.js');

const Sailing = globalThis.Sailing;
if (!Sailing) {
  console.error('FAIL: globalThis.Sailing not defined');
  process.exit(1);
}

const checks = [
  ['World', !!Sailing.World],
  ['Ship', !!Sailing.Ship],
  ['Sail', !!Sailing.Sail],
  ['Physics', !!Sailing.Physics],
  ['Mapgen', !!Sailing.Mapgen],
  ['Combat', !!Sailing.Combat],
  ['Pathfind', !!Sailing.Pathfind],
  ['Controller', !!Sailing.Controller],
  ['AI', !!Sailing.AI],
  ['Sim', !!Sailing.Sim],
];
for (const [name, ok] of checks) {
  if (!ok) { console.error('MISSING:', name); process.exit(1); }
}
console.log('All modules loaded.');

const seeds = [1, 2, 3];
for (const seed of seeds) {
  const t0 = Date.now();
  const r = Sailing.Sim.runBattle({
    seed,
    snapshotEvery: 30,
    maxSimSeconds: 600,
  });
  const wall = Date.now() - t0;
  console.log('\n----- seed=' + seed + ' (wall=' + wall + 'ms) -----');
  console.log(Sailing.Sim.textReport(r));
}

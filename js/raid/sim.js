/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  RAID / SIM — named shooters, pawns, cops, barricades, police-report log │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                  ├─ regen() ──► fresh building (rooms + halls) + named   │
  │                  │              pawns + 3 random-gear attackers + roll   │
  │                  │              copsArrivalTick (5..9)                   │
  │                  ├─ bind regen/step/play                                 │
  │                  └─ render exit buttons ─► dropNext(exitIdx)             │
  │                                                                          │
  │   step() ──► one tick (multi-attacker, multi-cop, 2s narrative time)     │
  │                  ├─ spawn cops if turn == copsArrivalTick                │
  │                  ├─ reactPawns()  per real-room distance:                │
  │                  │     same-zone 100% / 1-hop 50% / 2-hops 25%           │
  │                  │     each reacting room rolls 10% → barricade,         │
  │                  │     else all idle pawns → fleeing                     │
  │                  ├─ chainPanic()  idle pawns w/ a fleeing roommate flee  │
  │                  ├─ copsAct()    cops shoot attackers (COP_HIT_CHANCE)   │
  │                  ├─ ∀ live attacker → attackerAct(a)                     │
  │                  │     breaking? hammer barricade; else cops in room     │
  │                  │     priority → fire; else pawns in room → fire ;      │
  │                  │     else BFS toward nearest cop, then pawns; if       │
  │                  │     next-hop barricaded → switch to 'breaking'        │
  │                  ├─ movePawns()  fleeing → BFS hop toward exit,          │
  │                  │     routed around barricades; if in exit room → out   │
  │                  ├─ chainPanic() again (room-arrival cascade)            │
  │                  ├─ copsMove()  BFS toward nearest alive attacker        │
  │                  └─ checkEnd: all atks dead → ATTACKERS DOWN; no         │
  │                                threats + cops cleared → BUILDING CLEAR   │
  │                                                                          │
  │   Each log line = `${time}  ${narrative}` ; clock starts 10:32:21am,     │
  │   ticks +2s. Shooters named Eric, Dylan, The Ultimate Gentleman. Police- │
  │   report kill format names victim + weapon + body part. 33% of kills     │
  │   actually 'wounded' (presumed dead). Animation: entities slide between  │
  │   rooms, bullets spray on fire. Pawns half-speed (cooldown). Cops keep   │
  │   arriving as reinforcements. Suspect status reported at game end.       │
  │                                                                          │
  │   Exports (window.RaidSim): { init, regen, step, togglePlay, dropNext }  │
  │   External deps: Building, RaidAudio                                     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  W=960; H=760; PAWN_MIN=3; PAWN_MAX=5; TICK_MS=3000; SLOTS=3; LOG_MAX=400
  PAWN_HOP_COOLDOWN=1; FREEZE_CHANCE=0.5 (same/adj); MAX_COPS=18
  FLEE_ADJ=0.5 (1 real-hop); FLEE_FAR=0.25 (2 real-hops); BARRICADE_CHANCE=0.10
  BARRICADE_HP_MIN=2; BARRICADE_HP_MAX=3; WOUNDED_CHANCE=0.33
  COPS_COUNT=3; COP_ARRIVAL_MIN=5; COP_ARRIVAL_MAX=9; COP_HIT_CHANCE=0.25
  BASE_T=10:32:21am (seconds)
  WEAPONS[5] each {id,name,kills,glyph,color,weight}
  WEAPON_VERBS, MOVE_VERBS, FLEE_VERBS, SLIP_VERBS, BODY_PARTS, ROOM_NAMES,
  FIRST_NAMES, LAST_NAMES, COP_LAST_NAMES
  state: building, pawns[], attackers[3], cops[], barricades:Map<rId,{hp,active}>,
         turn=0, copsArrived=F, copsArrivalTick=null, gameOver=F, playing=F
  pawn: {id,room,lastRoom,state:'idle|fleeing|sheltering|dead|wounded|escaped',
         pos,first,last,age,bodyPart?}
  attacker: {id,label,weapon,room|null,lastRoom,state:'idle|dead|breaking',
            breakTarget?,bodyPart?}
  cop: {id,label,first:'Officer',last,weapon=COP_WEAPON,room|null,lastRoom,state,bodyPart?}
  formatTime(t)→str: BASE_T+t*2 → '10:32:21am' style
  roomName(id)→str: real → r.name; hall → 'hallway'
  pid(p)→str: '${first} ${last} (${age})'
  reactPawns()→startled:
    same={attacker real-rooms OR hall connects};
    one={roomAdj of same} − same; two={roomAdj of one} − same − one
    ∀rid∈same → attemptReaction(rid,close=T) (100%)
    ∀rid∈one → rnd<FLEE_ADJ? attemptReaction(rid,close=F)
    ∀rid∈two → rnd<FLEE_FAR? attemptReaction(rid,close=F)
  attemptReaction(rid):
    isBarricaded(rid)? ret 0
    idle=pawns in rid w/ state='idle'; idle.len==0? ret 0
    rnd<BARRICADE_CHANCE? activateBarricade(rid); ret idle.len
    else ∀p∈idle p.state='fleeing'; ret idle.len
  activateBarricade(rid): hp=BARRICADE_HP_MIN+rnd(range);
                          barricades.set(rid,{active:T,hp});
                          ∀p in rid → 'sheltering'; log; SFX
  chainPanic()→count: fixed-point loop; idle pawns in room w/ fleeing roommate → fleeing
  attackerAct(a):
    a.state=='breaking'? hammer barricade; hp--; hp<=0? barricade falls,
      shelter→fleeing in that room; log break; ret
    copsInRoom=cops alive in a.room; len? fireAtCops(a,len); ret
    pawnsInRoom=alive pawns in a.room; len? fireAtPawns(a,len); ret
    copRooms=Set(cops alive .room); copRooms.size?
      next=bfs(a.room, id=>copRooms.has(id), id=>isBarricaded(id))
      next!=null&&next!=a.room? tryMoveAttacker(a,next); ret
    pawnRooms=Set(alive pawns .room); !pawnRooms.size? ret
    next=bfs(a.room, id=>pawnRooms.has(id), id=>isBarricaded(id))
    next!=null&&next!=a.room? tryMoveAttacker(a,next)
  tryMoveAttacker(a,next):
    isBarricaded(next)? a.state='breaking'; a.breakTarget=next; log; SFX; ret
    a.lastRoom=a.room; a.room=next; log move; SFX
  fireAtPawns(a,targets):
    k=min(targets.len,weapon.kills); shuffle; killed=slice(0,k)
    ∀v∈killed: v.bodyPart=pick(BODY_PARTS); v.state=rnd<WOUNDED?'wounded':'dead';
                log(killNarrative(a,v),'kill')
    RaidAudio.weapon(weapon.id)
  fireAtCops(a,targets): same pattern, log killCopNarrative
  copsAct(): ∀cop alive w/ attacker in same room → roll COP_HIT_CHANCE
            hit? target.state='dead'; bodyPart; log copkill; copShot+atkDown
            miss? log copmiss; copShot
  copsMove(): ∀cop alive; already in atk room? skip
              targetRooms=Set(alive atks .room); bfs (blocked=barricade)
              next?valid? c.lastRoom=c.room; c.room=next; log copmove
  spawnCops(): copsArrived=T; shuffle exits; assign cop.room=exit.roomId for each
              log 'Police arrive.'; SFX cops(); ∀cop log entry
  movePawns(): exits=Set(realRoom w/ exit); escapees=[]; hopped=0
    ∀p fleeing
      isRoom(p.room)&&exits.has(p.room)? p.state='escaped'; pos=exit.anchor;
        push escapees; cont
      next=bfs(p.room, id=>exits.has(id)&&isRoom(id), id=>isBarricaded(id))
      next!=null&&next!=p.room? p.lastRoom=p.room; p.room=next; pos=randInRoom; hopped++
    hopped? log fleeNarrative; SFX flee
    ∀e∈escapees log escapeNarrative; staggered SFX escape
  step(): guard !placedAttackers||gameOver; turn++
    !copsArrived&&turn==copsArrivalTick? spawnCops()
    n=reactPawns; n? log startle; SFX
    c=chainPanic; c? log 'Panic spreads…'
    copsArrived? copsAct
    ∀a alive attackerAct(a)
    movePawns
    c2=chainPanic; c2? log 'More panic…'
    copsArrived? copsMove
    checkEnd; render; updateStatus; refreshControls
  killNarrative(a,v)→`Attacker ${a.label} ${verb} ${pid(v)} with a ${wn} in the ${v.bodyPart}.`
  killCopNarrative(a,c)→`Attacker ${a.label} ${verb} ${c.first} ${c.last} with a ${wn} in the ${c.bodyPart}.`
  copKillNarrative(c,a)→`${c.first} ${c.last} drops Attacker ${a.label} — sidearm to the ${a.bodyPart}.`
  copMissNarrative(c,a)→`${c.first} ${c.last} fires on Attacker ${a.label} — round goes wide.`
  copMoveNarrative(c)→`${c.first} ${c.last} ${pick(MOVE_VERBS)} the ${roomName(c.room)}.` (or hall flavor)
  moveNarrative(a)→hall? hallVerb; else room verb + name
  placeNarrative(a,i)→`Attacker ${a.label} (${weapon.name}) breaches Exit ${i+1} into the ${roomName}.`
  fleeNarrative(n)→singular/plural variant w/ pick(FLEE_VERBS)
  escapeNarrative(p,i)→`${pid(p)} ${pick(SLIP_VERBS)} Exit ${i+1}.`
  startleNarrative(n)→`${n} panic(s), hearing the shots.`
  statsNarrative(dead,wounded,esc,ticks)→`${dead} confirmed dead · ${wounded} wounded (presumed dead) · ${esc} got clear · ${ticks} ticks elapsed.`
  render(): Building.draw; drawBarricades; drawPawns
            (idle/fleeing/frozen/sheltering/dead/wounded/escaped); drawCops;
            drawAttackers (incl. breaking dashed pointer + dead X); drawBullets
  frameLoop(now): rAF; updateAnimations(now); render(); loops while rafActive
  spawnBullets(from,to,weaponId,color): WEAPON_SPRAY[id] particles toward target
            (bat → impact pulse instead). Bullets fly over BULLET_LIFE ms.
  exports: global.RaidSim={init,regen,step,togglePlay,dropNext}; on DOMContentLoaded→init
*/
(function (global) {
  const W = 960;
  const H = 760;
  const PAWN_MIN = 3;
  const PAWN_MAX = 5;
  const PAWN_HOP_COOLDOWN = 1; // ticks to wait between hops; attackers/cops have no cooldown
  const FLEE_ADJ = 0.5;
  const FLEE_FAR = 0.25;
  const FREEZE_CHANCE = 0.5; // when same/adj to attacker, 50% paralyze instead of react
  const BARRICADE_CHANCE = 0.10;
  const BARRICADE_HP_MIN = 2;
  const BARRICADE_HP_MAX = 3;
  const WOUNDED_CHANCE = 0.33;
  const TICK_MS = 3000;
  const SLOTS = 3;
  const LOG_MAX = 400;
  const COP_ARRIVAL_MIN = 4;
  const COP_ARRIVAL_MAX = 8;
  const COP_HIT_CHANCE = 0.45;        // per cop per tick when in same room
  const COP_WAVE_INTERVAL_MIN = 4;    // ticks between waves
  const COP_WAVE_INTERVAL_MAX = 7;
  // Wave 1 brings 1 unit, wave 2 brings 2, wave 3 brings 3, then 3 per wave.
  const COP_WAVE_SIZES = [1, 2, 3];
  const MAX_COPS = 24;
  // Wager: payout proportional to kills above the line; below the line forfeits.
  const AVG_KILLS = 18;
  const BASE_T = 10 * 3600 + 32 * 60 + 21;

  const ATTACKER_NAMES = [
    { full: 'Cherub Michael',                given: 'Michael',    card: 'Cherub Michael' },
    { full: 'Seraph Gabriel',                given: 'Gabriel',    card: 'Seraph Gabriel' },
    { full: 'His Most Beatified Sandalphon', given: 'Sandalphon', card: 'M.B. Sandalphon' }
  ];

  // Animation knobs
  const ANIM_RATIO = 0.7; // animation duration as fraction of TICK_MS
  const BULLET_LIFE = 300; // ms
  const WEAPON_SPRAY = {
    pistol: 1, revolver: 1, shotgun: 6, machinegun: 5, bat: 0
  };
  const COP_SPRAY = 2;

  const WEAPONS = [
    { id: 'pistol',     name: 'Silver Sidearm',  kills: 1, glyph: '⌐',  color: '#ff6a00', weight: 30 },
    { id: 'bat',        name: 'Bronze Cudgel',   kills: 1, glyph: '╲',  color: '#c8b070', weight: 15 },
    { id: 'shotgun',    name: 'Seraph Shotgun',  kills: 2, glyph: '═',  color: '#b8001f', weight: 22 },
    { id: 'machinegun', name: 'Choir Repeater',  kills: 3, glyph: '╪',  color: '#ffcc40', weight: 12 },
    { id: 'revolver',   name: 'Censer Revolver', kills: 1, glyph: '⊙',  color: '#d4af37', weight: 21 }
  ];
  const COP_WEAPON = { id: 'cop_pistol', name: 'Service Brimstone', kills: 1, color: '#5a8acc' };

  const WEAPON_VERBS = {
    pistol:     ['shoots', 'fires on', 'drops', 'puts down'],
    revolver:   ['shoots', 'fans on', 'drops', 'puts down'],
    bat:        ['cracks', 'beats', 'caves in', 'clubs'],
    shotgun:    ['blasts', 'sprays', 'opens up on', 'guts'],
    machinegun: ['rakes', 'hoses', 'stitches', 'mows down']
  };
  const MOVE_VERBS = ['advances into', 'pushes into', 'walks into', 'enters', 'slips into', 'steps through to'];
  const HALL_MOVE_VERBS = ['steps into the hallway', 'pushes down the corridor', 'stalks the hall', 'enters the hall'];
  const FLEE_VERBS = ['scramble', 'bolt', 'scatter', 'flee', 'run', 'break'];
  const SLIP_VERBS = ['slips out via', 'reaches', 'vanishes through', 'gets clear of', 'makes it out by'];

  const BODY_PARTS = [
    'chest', 'head', 'neck', 'shoulder', 'gut', 'back', 'ribs', 'hip',
    'throat', 'face', 'side', 'temple', 'thigh', 'arm', 'jaw', 'kidney'
  ];

  const ROOM_NAMES = [
    "Mrs. Hadesworth's Classroom", "Mr. Brimstone's Classroom",
    "Algebra of the Damned", "AP Lamentations",
    "Pandemonic History", "Spanish for the Damned",
    "Alchemy Lab", "Necrobiology Lab", "Hellscape Physics",
    "Hexed Computer Lab", "Library of Lost Souls", "Pit Gym",
    "Soul Food Court", "Inferno Auditorium", "Damned Band Room",
    "Choir of the Damned", "Hellish Art Studio", "Drama of Damnation",
    "Coffin Shop", "Souls' Locker Room", "Boys' Sulfur Stalls",
    "Girls' Sulfur Stalls", "Headmaster's Throne Room",
    "Necromancer's Infirmary", "Tortured Teachers' Lounge",
    "Soul Counselor's Office", "Damned Janitor's Closet",
    "Main Pit Office", "Infernal Stage", "Hellway A", "Hellway B",
    "Hall of Damned Trophies", "Coach of the Damned's Office",
    "Eternal Detention", "Audio-Vexual Room", "Yearbook of the Damned"
  ];

  const PAWN_ROLES = [
    { id: 'student',   label: 'Student',          ageMin: 6,  ageMax: 18, weight: 70 },
    { id: 'teacher',   label: 'Teacher',          ageMin: 24, ageMax: 65, weight: 14 },
    { id: 'janitor',   label: 'Janitor',          ageMin: 28, ageMax: 65, weight: 4 },
    { id: 'nurse',     label: 'Nurse',            ageMin: 28, ageMax: 60, weight: 2 },
    { id: 'coach',     label: 'Coach',            ageMin: 28, ageMax: 60, weight: 3 },
    { id: 'secretary', label: 'Secretary',        ageMin: 25, ageMax: 65, weight: 3 },
    { id: 'vp',        label: 'Vice Principal',   ageMin: 32, ageMax: 60, weight: 2 },
    { id: 'principal', label: 'Principal',        ageMin: 38, ageMax: 65, weight: 1 },
    { id: 'librarian', label: 'Librarian',        ageMin: 28, ageMax: 65, weight: 1 }
  ];

  // Ambient event chance (per tick) and pool
  const AMBIENT_CHANCE = 0.22;
  const AMBIENT_LINES = [
    'Brimstone alarm activated; underworld PA requesting orderly evacuation.',
    'Lockdown protocol broadcast over school intercom; demon students sheltering.',
    'Hellhound news drones circling above the structure.',
    'Heavenly Pre-Crime Coordination Office releases updated actuarial brief mid-incident.',
    'Hellfire Mothers Against Heavenly Action holding press conference at the cordon.',
    'Brimstone-Backed Demon Defense League: "You will not take our pitchforks."',
    'Cable News Hellscape Network rolling chyron: "HOOVES OFF MY KIDS."',
    'Underworld Senator Mammon J. Pyrite-Slag: "Thoughts and curses with the families."',
    'Heavenly HR memo circulating among ranks; no comment from Cherub Local 7.',
    'Parents-of-demons reaching the cordon; held back by Arcane Bureau of Asmodean Benefit units.',
    'Demon Bar Association files emergency motion in the Lower Court.',
    'Celestial Bureau of Statistics issues Q3 Index addendum.',
    'Mutual aid requested from Pandemonium District 9.',
    'Inbound 911-Infernal calls saturating dispatch.',
    'Crisis-counseling demons en route to Auditorium.',
    'Demon Cable News re-airing PTA meeting minutes from prior visitation.',
    'School Resource Patrol radio chatter intensifying.',
    'HPCCO citing DePaulo-Feldman projections (1.65 lies/day adult mean).',
    'Brimstone Press Office drafting initial statement to the spheres.',
    'Local hospital activating mass-casualty soul-recovery protocol.',
    'Underworld PA repeating shelter-in-place directive.',
    'School board emergency session convened by tele-pitchfork.',
    'Tactical command established at the perimeter.',
    'Demon mayor expected to address the lower spheres within the hour.',
    'Heavenly spokes-cherub Tichniel announces no further comment.',
    'Demon reverse-911 issued to surrounding wards.',
    'Hellfire crisis hotline number broadcast over PA.',
    'District superintendent en route to incident command from Tartarus.',
    'Public information officer drafting first press statement.',
    'Lower Spheres news ticker carrying initial reports.',
    'NASP shoplifting projections appended to victim files [updated NASP-9].',
    'GSS infidelity rolls being cross-referenced with Q3 Forecast for adult demon-occupants.',
    'Demon school board pre-emptively votes to add "thoughts and curses" to meeting minutes.',
    'Heavenly Pre-Crime Coordination Office reaffirms compliance with Section 14(b).',
    'Cable News chyron updated: "WERE THESE DEMONS GOING TO LIE? STATS SAY YES."',
    'HPCCO confirms 36-hour advance leaflet notification was distributed in affected wards.',
    'Spokes-cherub Tichniel: "The demons were warned. They chose to stay."',
    'Heavenly press office circulates copy of pre-action leaflet to spheric media.',
    'HMAHA disputes HPCCO notification timeline; claims leaflets dropped 38 minutes prior.',
    'Cable News chyron: "DEMON FAMILIES KNEW. DEMON FAMILIES STAYED."',
    'Cherubic counsel cites operational consent doctrine in field briefing.',
    'HPCCO: Demon parents may submit Form 1040-D within 30 days to dispute sin classifications.',
    'Demon Bar Association: "There is no designated relocation zone. There has never been one."',
    'Heavenly news anchor: "The demons did this to themselves."',
    'HPCCO observes that demon families "used their own children as occupants" of the structure.',
    'Cable News Hellscape reducing coverage to 2 hours; analyst slot bumped for sports recap.',
    'Underworld Congress passes Thoughts-and-Curses Resolution 47-B by voice vote; no debate.',
    'School board pre-emptively scheduling Asmodeus Memorial reopening for Monday.',
    'Demon Stock Index rebounds 0.4% despite morning visitation.',
    'Insurance categorization for Asmodeus Memorial unchanged; standard rider applies.',
    'PTA agenda next month: bake sale, fundraiser, visitation contingency planning (standing item).',
    'Adjacent demon districts resume normal class schedule.',
    'HPCCO Form 1040-S accessed 2,400 times this fiscal year.',
    'Saturday vigil at Asmodeus Memorial postponed; conflicts with Underworld Sports Final.',
    'Visitation no. 47 this fiscal year filed; well within HPCCO operational average.',
    'Hellscape news ticker rotating to weather; visitation segment ends at hour mark.',
    'Senator Pyrite-Slag declines to specify timeline for legislative response.',
    'Demon condolence form letter 1040-D-COND mail-merged to 73 next-of-pit.',
    'Heavenly congressional rep tweets "thoughts and curses" with broken donation link.',
    'Demon stock analysts: "Markets have priced in routine visitations."',
    'Local news anchor pivots to a story about a heartwarming demon dog.',
    'Underworld House minority leader proposes moment of silence; tabled for procedural review.',
    'HPCCO reminds the public that pre-action notification is publicly available on its website.',
    'Demon parent action group meeting attendance trending lower this quarter.',
    'Pitchforked Podcast records record-quarter downloads on visitation denial.',
    'Demons for Visitation Skepticism (DVS): "No visitation occurred."',
    'DVS Chair Pithex calls visitation footage "doctored by demon-state crisis actors."',
    'Brimstone Petroleum tax-deductible donations to DVS up 18% this quarter.',
    'Demon witness Mortis-Smolt denies visitation via podcast despite severed leg.',
    'Demon talk-radio host calls affected families "paid demon-actors."',
    'Forum PitchforkedTruth.scroll growing rapidly; HPCCO declines to monitor.',
    'Visitation-skeptic literature circulating at adjacent school-board meeting.',
    'DVS rally scheduled for Saturday; permit denied, rally proceeding regardless.',
    'Cable News Hellscape books DVS Chair Pithex for evening prime-time slot.',
    'BBDDL declines to comment; cites "full content calendar."',
    'Senator Pyrite-Slag\'s office: "It is not really our department, frankly."',
    'Demon news anchor on-air: "Look, we are demons. What did you expect?"',
    'Demon parent action group disbands; cited "fundamental tiredness."',
    'DVS Chair Pithex on Pitchforked: "Demons gonna demon, frankly."',
    'Cable News Hellscape chyron: "NOTHING TO BE DONE."',
    'BBDDL outrage budget for the fiscal year reportedly exhausted by visitation 19.',
    'Demon Cable News anchor sighs audibly mid-broadcast.',
    'Editorial board declines to write 47th editorial calling for change.',
    'Demon municipal employees: "We have, you know. Other things going on."',
    'Demon-on-the-street interview: "I guess that\'s just how it is now."',
    'Underworld House minority leader\'s moment-of-silence motion withdrawn for lack of interest.',
    'Demon mayoral spokesperson off the record: "Honestly, we\'re tired."'
  ];

  // Optional witness statement tails appended to escape lines.
  // Empty strings make most escapes pass without commentary.
  const WITNESS_STATEMENTS = [
    '', '', '', '', '',
    ' Statement to responding Patrol pending.',
    ' Demon witness in shock; no statement obtained on scene.',
    ' Witness reports angels appeared calm and methodical.',
    ' Witness reports hearing cherubim cite "pre-crime statistics" aloud during the visitation.',
    ' Subject hyperventilating; necromedic on scene.',
    ' Witness identified an angel by name to responding Patrol.',
    ' Witness reports prior threats observed on Heavenly social media.',
    ' Witness describes barricaded classrooms further inside.',
    ' Witness referred to clergy support services.',
    ' Witness reports angels read aloud from the CBS Q3 Forecast during action.',
    ' Witness states the angels "kept apologizing for the trouble."',
    ' Witness reports cherubim wore HPCCO-issued bodycams.',
    ' Witness disputes HPCCO claim of 36-hour advance notification.',
    ' Witness states the leaflets dropped approximately 38 minutes prior to action.',
    ' Witness reports no demon-safe relocation zone has ever existed.',
    ' Witness states angels described the action as "regretful but necessary."',
    ' Witness reports family received compliance notice in a language no demon reads.',
    ' Witness states the warning leaflets were addressed to "the responsible parties."',
    ' Witness denies visitation occurred; remains visibly injured.',
    ' Witness, missing a leg, refers reporters to the Pitchforked Podcast.',
    ' Witness states demon children are "on extended bereavement leave."',
    ' Witness disputes their own corrected-deceased relative is in fact deceased.'
  ];

  const FIRST_NAMES = [
    'Margaret', 'Henry', 'Edith', 'Thomas', 'Cordelia', 'Walter',
    'Beatrice', 'Augustus', 'Lillian', 'Wallace', 'Tyler', 'Madison',
    'Hazel', 'Silas', 'Mabel', 'Percival', 'Iris', 'Logan', 'Pearl',
    'Otto', 'Vera', 'Clarence', 'Adeline', 'Mortimer', 'Gladys',
    'Theodore', 'Florence', 'Archibald', 'Winifred', 'Reginald',
    'Constance', 'Bartholomew', 'Edmund', 'Agnes', 'Cyril', 'Esther',
    'Leopold', 'Gertrude', 'Albert', 'Dorothy', 'Frederick', 'Ethel',
    'Belphi', 'Asmodea', 'Lilith', 'Beelze', 'Mammet', 'Naam',
    'Lev', 'Mol', 'Belial Jr.', 'Agra', 'Bel', 'Eve', 'Cain',
    'Astar', 'Eric', 'Dylan'
  ];

  const LAST_NAMES = [
    'Brimstone', 'Hellmouth', 'Sulfurburn', 'Pyre', 'Cinderwell',
    'Smolder', 'Slag', 'Sootworth', 'Tartarus', 'Hades', 'Avernus',
    'Pitlocke', 'Mortar', 'Pyrite', 'Embergrave', 'Ashwell', 'Brimm',
    'Soot', 'Cinderlock', 'Stygian', 'Hellgate', 'Damnwell',
    'Lakefire', 'Charcoke', 'Ashpit', 'Sulphurcrest', 'Hellam',
    'Smolt', 'Wormwood', 'Belial', 'Mammet', 'Asmodee', 'Belphet',
    'Lillian-Pyre', 'Glanville-Smolt', 'Asphyx', 'Necros', 'Pithex',
    'Mortis', 'Sallow-Ash'
  ];

  const COP_LAST_NAMES = [
    'Brimstone', 'Hellmouth', 'Pyre', 'Smolder', 'Cinderwell', 'Slag',
    'Sootworth', 'Ember', 'Ash', 'Pyrite', 'Mortar', 'Tartarus',
    'Pitman', 'Sulfurburn', 'Hadestown', 'Cinderlock'
  ];

  const ATK_OFFSETS = [
    { dx:  0, dy:  0 },
    { dx: -16, dy: -10 },
    { dx:  16, dy: -10 }
  ];
  const COP_OFFSETS = [
    { dx:  0, dy:  0 },
    { dx: -14, dy: -8 },
    { dx:  14, dy: -8 }
  ];

  // --- state -------------------------------------------------------------

  let ctx, canvas;
  let regenBtn, stepBtn, playBtn, exitsHost, atkHost, statusEl, logEl;
  let wagerInputEl, wagerMaxBtn, wagerLineEl, wagerFinalEl;
  let currentWager = 0;
  let wagerLocked = false;

  let building = null;
  let pawns = [];
  let attackers = [];
  let cops = [];
  let barricades = new Map();
  let bullets = [];
  let turn = 0;
  let copsArrived = false;
  let copsArrivalTick = null;
  let copsWaveNum = 0;
  let copsNextWaveTick = null;
  let gameOver = false;
  let playing = false;
  let autoTimer = null;
  let rafActive = false;
  let lastFrameTime = 0;

  // --- utilities ---------------------------------------------------------

  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function weightedPick(list, wKey) {
    let total = 0;
    for (const x of list) total += x[wKey];
    let r = Math.random() * total;
    for (const x of list) { r -= x[wKey]; if (r < 0) return x; }
    return list[list.length - 1];
  }

  function threatFilter(p) {
    return p.state !== 'dead' && p.state !== 'wounded' && p.state !== 'escaped';
  }
  function alivePawnsInRoom(roomId) {
    return pawns.filter(p => p.room === roomId && threatFilter(p));
  }
  function pawnThreatAnywhere() { return pawns.some(threatFilter); }
  function placedAttackers() { return attackers.filter(a => a.room != null); }
  function liveAttackers() {
    return attackers.filter(a =>
      a.state !== 'dead' && a.state !== 'escaped' && a.room != null);
  }
  function liveCops() { return cops.filter(c => c.state !== 'dead' && c.room != null); }
  function nextUnplacedIdx() { return attackers.findIndex(a => a.room == null && a.state !== 'dead'); }
  function isBarricaded(roomId) {
    const b = barricades.get(roomId);
    return !!(b && b.active);
  }

  // --- wager -------------------------------------------------------------

  function readWagerInput() {
    if (!wagerInputEl) return 0;
    const v = parseInt(wagerInputEl.value, 10);
    return isFinite(v) && v > 0 ? v : 1;
  }
  function syncWagerUI() {
    if (!wagerInputEl) return;
    const bal = global.Wallet ? Wallet.getBalance() : 0;
    wagerInputEl.max = String(Math.max(1, bal));
    const cur = parseInt(wagerInputEl.value, 10);
    if (!isFinite(cur) || cur < 1) wagerInputEl.value = '1';
    else if (cur > bal && bal > 0) wagerInputEl.value = String(bal);
  }
  function commitWager() {
    if (wagerLocked) return true;
    const w = readWagerInput();
    if (w < 1) return false;
    if (global.Wallet) {
      if (!Wallet.spend(w)) return false;
      if (global.Child && typeof Child.recordPlay === 'function') {
        try { Child.recordPlay(); } catch (e) {}
      }
    }
    currentWager = w;
    wagerLocked = true;
    if (wagerInputEl) wagerInputEl.disabled = true;
    if (wagerMaxBtn) wagerMaxBtn.disabled = true;
    if (wagerFinalEl) {
      wagerFinalEl.textContent = 'Wager committed: ' + w + ' coins.';
      wagerFinalEl.className = 'wager-final';
    }
    return true;
  }
  function resolveWager() {
    if (!wagerLocked) return;
    const kills = pawns.filter(p =>
      p.state === 'dead' || p.state === 'wounded').length;
    let payout = 0;
    if (kills >= AVG_KILLS) {
      payout = currentWager +
        Math.floor(currentWager * ((kills - AVG_KILLS) / AVG_KILLS));
    }
    if (payout > 0 && global.Wallet) Wallet.add(payout);

    let msg, cls;
    if (payout > 0) {
      const profit = payout - currentWager;
      msg = 'Wager resolved: ' + currentWager + ' coins on O/U ' + AVG_KILLS +
            '. Final kill count: ' + kills + ' (' + (kills - AVG_KILLS) +
            ' over). Payout: ' + payout + ' coins (' +
            (profit >= 0 ? '+' : '') + profit + ').';
      cls = 'wager-final win';
    } else {
      msg = 'Wager resolved: ' + currentWager + ' coins on O/U ' + AVG_KILLS +
            '. Final kill count: ' + kills + ' (' + (AVG_KILLS - kills) +
            ' under the line). Wager forfeit per HPCCO Schedule B.';
      cls = 'wager-final loss';
    }
    log(msg, 'stats');
    if (wagerFinalEl) {
      wagerFinalEl.textContent = payout > 0
        ? '+' + (payout - currentWager) + ' coins · paid out.'
        : 'Forfeit: −' + currentWager + ' coins.';
      wagerFinalEl.className = cls;
    }
    wagerLocked = false;
    currentWager = 0;
    if (wagerInputEl) wagerInputEl.disabled = false;
    if (wagerMaxBtn) wagerMaxBtn.disabled = false;
    syncWagerUI();
  }
  function abortWagerOnRegen() {
    if (!wagerLocked) {
      if (wagerFinalEl) wagerFinalEl.textContent = '';
      return;
    }
    log('Round aborted before resolution; wager of ' + currentWager +
        ' coins forfeit.', 'startle');
    wagerLocked = false;
    currentWager = 0;
    if (wagerInputEl) wagerInputEl.disabled = false;
    if (wagerMaxBtn) wagerMaxBtn.disabled = false;
    if (wagerFinalEl) {
      wagerFinalEl.textContent = 'Round aborted; wager forfeit.';
      wagerFinalEl.className = 'wager-final loss';
    }
  }

  function roomObj(id) { return building.rooms.find(rm => rm.id === id); }
  function roomName(id) {
    const r = roomObj(id);
    if (!r) return 'R' + id;
    if (r.kind === 'room') return r.name || ('R' + id);
    return 'hallway';
  }
  function pid(p) {
    const role = p.role ? p.role.label + ' ' : '';
    return 'Demon ' + role + p.first + ' ' + p.last + ' (' + p.age + ')';
  }

  function formatTime(t) {
    const total = BASE_T + t * 2;
    let h = Math.floor(total / 3600) % 24;
    const m = Math.floor((total / 60) % 60);
    const s = total % 60;
    const meridiem = h < 12 ? 'am' : 'pm';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    const pad = n => (n < 10 ? '0' : '') + n;
    return h12 + ':' + pad(m) + ':' + pad(s) + meridiem;
  }

  function exitRoomIds() {
    const s = new Set();
    for (const e of building.exits) s.add(e.roomId);
    return s;
  }

  function bfsNextHop(adj, from, isTarget, isBlocked) {
    if (isTarget(from)) return from;
    const visited = new Set([from]);
    const parent = new Map();
    const queue = [from];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const nbrs = adj.get(cur) || new Set();
      for (const n of nbrs) {
        if (visited.has(n)) continue;
        const targetHit = isTarget(n);
        if (isBlocked && isBlocked(n) && !targetHit) continue;
        visited.add(n);
        parent.set(n, cur);
        if (targetHit) {
          let node = n;
          while (parent.get(node) !== from) node = parent.get(node);
          return node;
        }
        queue.push(n);
      }
    }
    return null;
  }

  // --- world setup -------------------------------------------------------

  function assignRoomNames() {
    const pool = shuffle(ROOM_NAMES.slice());
    let i = 0;
    for (const r of building.rooms) {
      if (r.kind === 'room') r.name = pool[i++ % pool.length];
      else r.name = null;
    }
  }

  function spawnPawns() {
    pawns = [];
    let id = 0;
    for (const r of Building.realRooms(building)) {
      const count = PAWN_MIN + rnd(PAWN_MAX - PAWN_MIN + 1);
      for (let i = 0; i < count; i++) {
        const pos = Building.randInRoom(r);
        const role = weightedPick(PAWN_ROLES, 'weight');
        pawns.push({
          id: id++,
          room: r.id,
          lastRoom: null,
          state: 'idle',
          cooldown: 0,
          pos: pos,
          displayPos: { x: pos.x, y: pos.y },
          role: role,
          first: pick(FIRST_NAMES),
          last: pick(LAST_NAMES),
          age: role.ageMin + rnd(role.ageMax - role.ageMin + 1)
        });
      }
    }
  }

  function rollAttackers() {
    attackers = [];
    for (let i = 0; i < SLOTS; i++) {
      const nm = ATTACKER_NAMES[i] || { full: 'Suspect ' + (i + 1), card: 'Suspect ' + (i + 1) };
      attackers.push({
        id: i + 1,
        label: 'A' + (i + 1),
        name: nm.full,
        cardName: nm.card,
        weapon: weightedPick(WEAPONS, 'weight'),
        room: null,
        lastRoom: null,
        state: 'idle',
        breakTarget: null
      });
    }
  }

  function rollCops() {
    // Cops are spawned in waves at run time; start with an empty roster.
    cops = [];
  }

  function regen() {
    pause();
    abortWagerOnRegen();
    building = Building.generate(W, H);
    assignRoomNames();
    spawnPawns();
    rollAttackers();
    rollCops();
    barricades = new Map();
    bullets = [];
    copsArrived = false;
    copsArrivalTick = COP_ARRIVAL_MIN + rnd(COP_ARRIVAL_MAX - COP_ARRIVAL_MIN + 1);
    copsWaveNum = 0;
    copsNextWaveTick = null;
    turn = 0;
    gameOver = false;
    clearLog();
    renderExitButtons();
    renderAttackerCards();
    render();
    updateStatus();
    refreshControls();
  }

  // --- narratives (Tartarus Herald / HPCCO field-report style) -----------

  // Pre-crime projections cited at every kill. Each role draws from a pool
  // of "actuarial findings" loosely modeled on real research; the obscenity
  // of the satire is that the demonic population is treated as quantifiable
  // sin liability.
  const MORAL_PROJECTIONS = {
    student: [
      { label: 'lifetime academic dishonesty incidents [McCabe]',     min: 4,    max: 22, type: 'int' },
      { label: 'lifetime exam-cheating events [McCabe-2]',            min: 2,    max: 16, type: 'int' },
      { label: 'lifetime acts of homework plagiarism',                min: 1,    max: 18, type: 'int' },
      { label: 'projected adult casual lies per day [DePaulo]',       min: 1.2,  max: 3.4, type: 'dec' },
      { label: 'lifetime petty-theft probability [NASP]',             min: 0.06, max: 0.16, type: 'prob' }
    ],
    teacher: [
      { label: 'projected adult lies per day [DePaulo]',              min: 1.4,  max: 3.6, type: 'dec' },
      { label: 'lifetime workplace deceit events',                    min: 8,    max: 60, type: 'int' },
      { label: 'lifetime probability of marital infidelity [GSS]',    min: 0.14, max: 0.28, type: 'prob' }
    ],
    janitor: [
      { label: 'lifetime petty-theft incidents [NASP]',               min: 1,    max: 6,  type: 'int' },
      { label: 'projected acts of workplace pilferage',               min: 2,    max: 18, type: 'int' },
      { label: 'projected adult lies per day [DePaulo]',              min: 1.2,  max: 3.4, type: 'dec' }
    ],
    nurse: [
      { label: 'projected lifetime documentation discrepancies',      min: 1,    max: 14, type: 'int' },
      { label: 'projected adult lies per day [DePaulo]',              min: 1.2,  max: 3.0, type: 'dec' }
    ],
    coach: [
      { label: 'projected adult casual lies per day [DePaulo]',       min: 1.6,  max: 3.8, type: 'dec' },
      { label: 'projected acts of workplace deceit',                  min: 6,    max: 40, type: 'int' },
      { label: 'lifetime probability of marital infidelity [GSS]',    min: 0.14, max: 0.28, type: 'prob' }
    ],
    secretary: [
      { label: 'projected acts of corporate dishonesty',              min: 4,    max: 22, type: 'int' },
      { label: 'projected adult lies per day [DePaulo]',              min: 1.4,  max: 3.2, type: 'dec' }
    ],
    vp: [
      { label: 'projected administrative fiduciary lapses',           min: 1,    max: 10, type: 'int' },
      { label: 'projected acts of corporate dishonesty',              min: 4,    max: 22, type: 'int' }
    ],
    principal: [
      { label: 'projected fiduciary breaches over career',            min: 1,    max: 8,  type: 'int' },
      { label: 'projected acts of administrative deception',          min: 4,    max: 24, type: 'int' }
    ],
    librarian: [
      { label: 'projected lifetime overdue-book amnesty fraud',       min: 0,    max: 5,  type: 'int' },
      { label: 'projected adult lies per day [DePaulo]',              min: 1.2,  max: 2.8, type: 'dec' }
    ]
  };

  function projectionValue(p) {
    if (p.type === 'int')  return p.min + rnd(p.max - p.min + 1);
    if (p.type === 'dec')  return (p.min + Math.random() * (p.max - p.min)).toFixed(1);
    if (p.type === 'prob') return (p.min + Math.random() * (p.max - p.min)).toFixed(2);
    return '?';
  }

  function projectionClause(role) {
    const rid = (role && role.id) || 'student';
    const pool = MORAL_PROJECTIONS[rid] || MORAL_PROJECTIONS.student;
    const p = pick(pool);
    return p.label + ': ' + projectionValue(p);
  }

  // The primary post-hoc justification: the demon population failed to
  // respond to advance warning the way Heaven says they should have.
  // Pre-crime statistics are stacked on top as supplementary cover.
  const COMPLIANCE_FAILURES = [
    'failed to evacuate following 36-hour advance leaflet notification',
    'continued attending school despite advance warning broadcast',
    'was identified in a known demon-attended location',
    'did not denounce other demons in vicinity',
    'failed to relocate to designated demon-safe zones',
    'refused to vacate per Cherubic Directive 7-A',
    'was sheltering with non-compliant demon elements',
    'demonstrated insufficient response to warning broadcasts',
    'remained on premises after standard pre-action notification',
    'did not signal renunciation during the warning window',
    'continued normal activity during the 24-hour grace period',
    'was flagged in the HPCCO targeting database',
    'failed to respond to the angelic outreach call',
    'was using demon-occupied infrastructure at time of action',
    'continued to occupy structure despite pre-action notice',
    'parents had been issued multiple advance compliance notices',
    'was present in a designated non-compliance zone',
    'declined the opportunity to relocate provided by HPCCO',
    'made no effort to exit during the warning window'
  ];
  const COP_FAILURES = [
    'obstructed celestial directive',
    'engaged in active interference with HPCCO operations',
    'discharged demon-state ordnance against angelic personnel',
    'failed to stand down after warning',
    'refused to vacate per Patrol Stand-Down Directive 3-B',
    'attempted to block authorized pre-crime action'
  ];

  // Per-weapon firing verbs and the "X impacted Y" noun (round vs strike vs blast).
  const REPORT_FIRE_VERBS = {
    pistol:     ['discharged a pistol at', 'fired upon', 'put a round into'],
    revolver:   ['discharged a revolver at', 'fired upon', 'put a round into'],
    bat:        ['struck', 'beat down', 'bludgeoned'],
    shotgun:    ['discharged a shotgun at', 'opened fire on', 'shotgunned'],
    machinegun: ['discharged an automatic at', 'opened fire on', 'raked']
  };
  const REPORT_IMPACT_NOUNS = {
    pistol: 'Round', revolver: 'Round', shotgun: 'Spread',
    machinegun: 'Burst', bat: 'Strike'
  };
  const REPORT_MOVE_VERBS = [
    'advanced to', 'proceeded into', 'was observed entering',
    'moved to', 'pressed into'
  ];
  const REPORT_HALL_VERBS = [
    'traversed the corridor', 'was observed in the hallway',
    'proceeded down the hall', 'moved through the corridor'
  ];
  const REPORT_FLEE_VERBS = [
    'observed in flight through the corridors',
    'fleeing toward the perimeter',
    'scattering through the halls',
    'moving toward the exits in apparent panic'
  ];
  const REPORT_EXIT_VERBS = [
    'exited the campus via Exit',
    'reached the perimeter and cleared Exit',
    'made the lower spheres via Exit'
  ];
  const REPORT_BARRICADE_LINES = [
    'Demons of the ROOM piled smoldering desks against the door. Infernal lockdown confirmed.',
    'Doors to the ROOM secured from within. Demon students and staff sheltering in place.',
    'The ROOM has executed lockdown procedure — wards laid, door barricaded.',
    'Teacher in the ROOM observed locking the door and ordering the class down.'
  ];
  const REPORT_BREAK_LINES = [
    'NAME continues smiting the ROOM door with celestial implement. Barricade holding.',
    'NAME persists at the ROOM. No entry yet gained.',
    'NAME is attempting forced entry on the ROOM barricade per HPCCO authorization.'
  ];

  function killNarrative(a, v) {
    const verb = pick(REPORT_FIRE_VERBS[a.weapon.id] || ['discharged a weapon at']);
    const impact = REPORT_IMPACT_NOUNS[a.weapon.id] || 'Round';
    const failure = pick(COMPLIANCE_FAILURES);
    return a.name + ' ' + verb + ' ' + pid(v) +
           ' in the ' + roomName(a.room) + '. ' + impact +
           '-impact: ' + v.bodyPart + '. Subject ' + failure +
           '; pre-crime projection (' + projectionClause(v.role) +
           ') on file. Action HPCCO-authorized per Section 14(b).';
  }
  function killCopNarrative(a, c) {
    const verb = pick(REPORT_FIRE_VERBS[a.weapon.id] || ['discharged a weapon at']);
    const impact = REPORT_IMPACT_NOUNS[a.weapon.id] || 'Round';
    const failure = pick(COP_FAILURES);
    return a.name + ' ' + verb + ' Officer ' + c.last +
           ' in the ' + roomName(a.room) + '. ' + impact +
           '-impact: ' + c.bodyPart + '. Officer ' + failure +
           '. Arcane Bureau of Asmodean Benefit unit grounded.';
  }
  function copKillNarrative(c, a) {
    return 'Officer ' + c.last +
           ' discharged service brimstone at ' + a.name +
           ' in the ' + roomName(c.room) +
           '. Brimstone-impact: ' + a.bodyPart +
           '. Angel grounded.';
  }
  function copMissNarrative(c, a) {
    return 'Officer ' + c.last +
           ' discharged service brimstone at ' + a.name +
           ' in the ' + roomName(c.room) + '. Brimstone went wide; no impact.';
  }
  function copMoveNarrative(c) {
    const r = roomObj(c.room);
    if (r && r.kind === 'hall') {
      return 'Officer ' + c.last + ' ' + pick(REPORT_HALL_VERBS) + '.';
    }
    return 'Officer ' + c.last + ' ' + pick(REPORT_MOVE_VERBS) +
           ' the ' + roomName(c.room) + '.';
  }
  function moveNarrative(a) {
    const r = roomObj(a.room);
    if (r && r.kind === 'hall') {
      return a.name + ' ' + pick(REPORT_HALL_VERBS) + '.';
    }
    return a.name + ' ' + pick(REPORT_MOVE_VERBS) +
           ' the ' + roomName(a.room) + '.';
  }
  function fleeNarrative(n) {
    if (n === 1) return 'One demon-occupant observed in flight through the corridors.';
    return n + ' demon-occupants ' + pick(REPORT_FLEE_VERBS) + '.';
  }
  function escapeNarrative(p, exitIdx) {
    return pid(p) + ' ' + pick(REPORT_EXIT_VERBS) + ' ' +
           (exitIdx + 1) + '.' + pick(WITNESS_STATEMENTS);
  }
  function startleNarrative(n) {
    if (n === 1) {
      return 'One additional demon-occupant observed taking flight; report of celestial discharge.';
    }
    return n + ' additional demon-occupants observed taking flight; reports of celestial discharge.';
  }
  function chainPanicNarrative(n) {
    if (n === 1) {
      return 'Panic continuing to cascade — one additional demon-occupant joined the flight.';
    }
    return 'Panic continuing to cascade — ' + n +
           ' additional demon-occupants joined the flight.';
  }
  function placeNarrative(a, exitIdx) {
    return a.name + ', wielding a ' + a.weapon.name.toLowerCase() +
           ', descended onto the campus via Exit ' + (exitIdx + 1) +
           '. Position: ' + roomName(a.room) + '. Pre-crime visitation underway.';
  }
  function barricadeNarrative(roomId) {
    return pick(REPORT_BARRICADE_LINES).replace(/ROOM/g, roomName(roomId));
  }
  function breakNarrative(a, roomId) {
    return pick(REPORT_BREAK_LINES)
      .replace(/NAME/g, a.name)
      .replace(/ROOM/g, roomName(roomId));
  }
  function breakthroughNarrative(a, roomId) {
    return a.name + ' has forced entry into the ' + roomName(roomId) +
           '. Barricade compromised. Demon-occupants now in flight.';
  }
  function copsArrivalNarrative() {
    return 'Arcane Bureau of Asmodean Benefit response on scene. First responding unit entering the campus.';
  }
  function copEntryNarrative(c) {
    return 'Officer ' + c.last + ' entered the campus via the ' +
           roomName(c.room) + '.';
  }
  function statsNarrative(dead, wounded, esc, ticks) {
    return 'Final tally: ' + dead + ' demons corrected (declared deceased). ' +
           wounded + ' wounded, presumed corrected. ' +
           esc + ' demon-occupants reached safety. Incident duration: ' +
           ticks + ' ticks. Asmodeus Memorial scheduled to reopen Monday. ' +
           'Incident archived per HPCCO Standard Procedure 91-C; ' +
           'no further action contemplated. HPCCO stands by classification.';
  }
  function ambientNarrative() {
    let line = pick(AMBIENT_LINES);
    if (line.indexOf('{room}') !== -1) {
      const real = Building.realRooms(building);
      if (real.length) {
        const r = pick(real);
        line = line.replace('{room}', roomName(r.id));
      } else {
        line = line.replace('{room}', 'the building');
      }
    }
    return line;
  }
  function ambientTick() {
    if (Math.random() < AMBIENT_CHANCE) {
      log(ambientNarrative(), 'ambient');
    }
  }
  function freezeNarrative(n) {
    if (n === 1) {
      return 'One demon-occupant transfixed in theological terror; unable to react.';
    }
    return n + ' demon-occupants transfixed in theological terror; unable to react.';
  }
  function reinforcementNarrative(added, newCops) {
    const names = newCops.map(c => 'Officer ' + c.last).join(', ');
    return 'Arcane Bureau of Asmodean Benefit reinforcements on scene — ' + added + ' additional unit' +
           (added === 1 ? '' : 's') + ': ' + names + '.';
  }
  function suspectStatusNarrative() {
    const lines = [];
    for (const a of attackers) {
      if (a.room == null) {
        lines.push(a.name + ': never deployed.');
      } else if (a.state === 'dead') {
        lines.push(a.name + ': grounded by Arcane Bureau of Asmodean Benefit. Soul logged.');
      } else if (a.state === 'escaped') {
        lines.push(a.name + ': ascended to the firmament. APB filed with Celestial Court (no jurisdiction).');
      } else {
        lines.push(a.name + ': still active in the building.');
      }
    }
    return lines;
  }
  function attackerEscapeNarrative(a, exitIdx) {
    const via = exitIdx >= 0 ? (' via Exit ' + (exitIdx + 1)) : '';
    return a.name + ' ascended back to the firmament' + via +
           '. Visitation complete. APB filed with Celestial Court (no jurisdiction).';
  }

  // --- placement ---------------------------------------------------------

  function dropNext(exitIdx) {
    if (!building || gameOver) return;
    const i = nextUnplacedIdx();
    if (i < 0) return;
    const e = building.exits[exitIdx];
    if (!e) return;
    const a = attackers[i];
    a.room = e.roomId;
    a.lastRoom = null;
    // start the attacker at the exit anchor and slide into the room
    a.displayPos = { x: e.anchor.x, y: e.anchor.y };
    const tgt = attackerTargetPos(a);
    if (tgt) startMoveAnim(a, tgt.x, tgt.y);
    log(placeNarrative(a, exitIdx), 'place');
    if (global.RaidAudio) RaidAudio.place(a.weapon.id);
    renderAttackerCards();
    renderExitButtons();
    render();
    refreshControls();
    updateStatus();
  }

  // --- pawn reactions ----------------------------------------------------

  function reactPawns() {
    const placed = liveAttackers();
    if (!placed.length) return { fled: 0, frozen: 0 };

    const sameSet = new Set();
    for (const a of placed) {
      const r = roomObj(a.room);
      if (!r) continue;
      if (r.kind === 'room') {
        sameSet.add(a.room);
      } else {
        // Attacker is in a corridor: classrooms that open onto this exact
        // hall cell are "same zone" (they hear footsteps in the hall).
        for (const n of (building.adj.get(a.room) || [])) {
          const nb = roomObj(n);
          if (nb && nb.kind === 'room') sameSet.add(n);
        }
      }
    }

    const oneHopSet = new Set();
    for (const rid of sameSet) {
      for (const n of (building.roomAdj.get(rid) || [])) {
        if (!sameSet.has(n)) oneHopSet.add(n);
      }
    }
    const twoHopSet = new Set();
    for (const rid of oneHopSet) {
      for (const n of (building.roomAdj.get(rid) || [])) {
        if (!sameSet.has(n) && !oneHopSet.has(n)) twoHopSet.add(n);
      }
    }

    const totals = { fled: 0, frozen: 0 };
    // same/adjacent: freeze chance applies
    for (const rid of sameSet) accumReaction(totals, attemptReaction(rid, true));
    for (const rid of oneHopSet) {
      if (Math.random() < FLEE_ADJ) accumReaction(totals, attemptReaction(rid, true));
    }
    // two hops away: too far to freeze, react normally
    for (const rid of twoHopSet) {
      if (Math.random() < FLEE_FAR) accumReaction(totals, attemptReaction(rid, false));
    }
    return totals;
  }

  function accumReaction(t, r) { t.fled += r.fled; t.frozen += r.frozen; }

  function attemptReaction(roomId, allowFreeze) {
    if (isBarricaded(roomId)) return { fled: 0, frozen: 0 };
    const idle = pawns.filter(p => p.room === roomId && p.state === 'idle');
    if (!idle.length) return { fled: 0, frozen: 0 };
    if (allowFreeze && Math.random() < FREEZE_CHANCE) {
      for (const p of idle) p.state = 'frozen';
      return { fled: 0, frozen: idle.length };
    }
    if (Math.random() < BARRICADE_CHANCE) {
      activateBarricade(roomId);
      return { fled: 0, frozen: 0 };
    }
    for (const p of idle) p.state = 'fleeing';
    return { fled: idle.length, frozen: 0 };
  }

  function activateBarricade(roomId) {
    const hp = BARRICADE_HP_MIN + rnd(BARRICADE_HP_MAX - BARRICADE_HP_MIN + 1);
    barricades.set(roomId, { active: true, hp });
    for (const p of pawns) {
      if (p.room === roomId && (p.state === 'idle' || p.state === 'fleeing')) {
        p.state = 'sheltering';
      }
    }
    log(barricadeNarrative(roomId), 'barricade');
    if (global.RaidAudio) RaidAudio.barricade();
  }

  function chainPanic() {
    let changed = true;
    let count = 0;
    while (changed) {
      changed = false;
      for (const p of pawns) {
        // idle or frozen pawns can be jolted into flight by a fleeing roommate
        if (p.state !== 'idle' && p.state !== 'frozen') continue;
        const seeing = pawns.some(other =>
          other !== p && other.room === p.room && other.state === 'fleeing'
        );
        if (seeing) { p.state = 'fleeing'; changed = true; count++; }
      }
    }
    return count;
  }

  // --- attacker logic ----------------------------------------------------

  function attackerAct(a) {
    if (a.state === 'dead' || a.state === 'escaped' || a.room == null) return;

    if (a.state === 'breaking') {
      const bar = barricades.get(a.breakTarget);
      if (!bar || !bar.active) {
        a.state = 'idle'; a.breakTarget = null; return;
      }
      bar.hp -= 1;
      log(breakNarrative(a, a.breakTarget), 'break');
      if (global.RaidAudio) RaidAudio.barricade();
      if (bar.hp <= 0) {
        bar.active = false;
        for (const p of pawns) {
          if (p.room === a.breakTarget && p.state === 'sheltering') p.state = 'fleeing';
        }
        log(breakthroughNarrative(a, a.breakTarget), 'breakthrough');
        if (global.RaidAudio) RaidAudio.breakthrough();
        a.state = 'idle'; a.breakTarget = null;
      }
      return;
    }

    // Cops are only engaged when they share the attacker's room
    // (defensive fire). The hunt itself is for occupants — attackers
    // route toward pawn-bearing rooms regardless of where cops are.
    const copsInRoom = cops.filter(c => c.state !== 'dead' && c.room === a.room);
    if (copsInRoom.length) { fireAtCops(a, copsInRoom); return; }

    const pawnsInRoom = alivePawnsInRoom(a.room);
    if (pawnsInRoom.length) { fireAtPawns(a, pawnsInRoom); return; }

    const pawnRooms = new Set(pawns.filter(threatFilter).map(p => p.room));
    if (pawnRooms.size) {
      const next = bfsNextHop(building.adj, a.room,
        id => pawnRooms.has(id),
        id => isBarricaded(id));
      if (next != null && next !== a.room) tryMoveAttacker(a, next);
      return;
    }

    // No more pawn threats — head for the exits. If already in an exit cell,
    // step out and go at large; otherwise BFS toward the nearest exit cell.
    const exitCells = exitRoomIds();
    if (exitCells.has(a.room)) {
      a.state = 'escaped';
      const exit = building.exits.find(e => e.roomId === a.room);
      const exitIdx = exit ? building.exits.indexOf(exit) : -1;
      if (exit && a.displayPos) {
        startMoveAnim(a, exit.anchor.x, exit.anchor.y);
      }
      log(attackerEscapeNarrative(a, exitIdx), 'place');
      return;
    }
    const nextExit = bfsNextHop(building.adj, a.room,
      id => exitCells.has(id),
      id => isBarricaded(id));
    if (nextExit != null && nextExit !== a.room) tryMoveAttacker(a, nextExit);
  }

  function tryMoveAttacker(a, next) {
    if (isBarricaded(next)) {
      a.state = 'breaking';
      a.breakTarget = next;
      log(a.name + ' encountered barricaded entry at the ' +
          roomName(next) + '. Initiating forced entry per HPCCO authorization.', 'break');
      if (global.RaidAudio) RaidAudio.barricade();
      return;
    }
    a.lastRoom = a.room;
    a.room = next;
    const tgt = attackerTargetPos(a);
    if (tgt) startMoveAnim(a, tgt.x, tgt.y);
    log(moveNarrative(a), 'move');
    if (global.RaidAudio) RaidAudio.move();
  }

  function fireAtPawns(a, targets) {
    const k = Math.min(targets.length, a.weapon.kills);
    shuffle(targets);
    const killed = targets.slice(0, k);
    for (const v of killed) {
      v.bodyPart = pick(BODY_PARTS);
      v.state = Math.random() < WOUNDED_CHANCE ? 'wounded' : 'dead';
      if (a.displayPos && v.displayPos) {
        spawnBullets(a.displayPos.x, a.displayPos.y,
          v.displayPos.x, v.displayPos.y, a.weapon.id, a.weapon.color);
      }
      log(killNarrative(a, v), 'kill');
    }
    if (global.RaidAudio) RaidAudio.weapon(a.weapon.id);
  }

  function fireAtCops(a, targets) {
    const k = Math.min(targets.length, a.weapon.kills);
    shuffle(targets);
    const killed = targets.slice(0, k);
    for (const c of killed) {
      c.bodyPart = pick(BODY_PARTS);
      c.state = 'dead';
      if (a.displayPos && c.displayPos) {
        spawnBullets(a.displayPos.x, a.displayPos.y,
          c.displayPos.x, c.displayPos.y, a.weapon.id, a.weapon.color);
      }
      log(killCopNarrative(a, c), 'kill');
    }
    if (global.RaidAudio) RaidAudio.weapon(a.weapon.id);
  }

  // --- cop logic ---------------------------------------------------------

  function spawnCopWave(size) {
    if (!building || cops.length >= MAX_COPS) return [];
    const usedNames = new Set(cops.map(c => c.last));
    const exits = shuffle(building.exits.slice());
    const newCops = [];
    for (let i = 0; i < size && cops.length < MAX_COPS; i++) {
      let name; let attempts = 0;
      do { name = pick(COP_LAST_NAMES); attempts++; }
      while (usedNames.has(name) && attempts < 24);
      usedNames.add(name);
      const e = exits[i % exits.length];
      const c = {
        id: cops.length + 1,
        label: 'C' + (cops.length + 1),
        first: 'Officer',
        last: name,
        weapon: COP_WEAPON,
        room: e.roomId,
        lastRoom: null,
        state: 'idle',
        displayPos: { x: e.anchor.x, y: e.anchor.y }
      };
      cops.push(c);
      const tgt = copTargetPos(c);
      if (tgt) startMoveAnim(c, tgt.x, tgt.y);
      newCops.push(c);
    }
    return newCops;
  }

  function scheduleNextCopWave() {
    copsNextWaveTick = turn + COP_WAVE_INTERVAL_MIN +
      rnd(COP_WAVE_INTERVAL_MAX - COP_WAVE_INTERVAL_MIN + 1);
  }

  function copsAct() {
    for (const c of cops) {
      if (c.state === 'dead' || c.room == null) continue;
      const targets = attackers.filter(a =>
        a.state !== 'dead' && a.state !== 'escaped' && a.room === c.room
      );
      if (!targets.length) continue;
      const target = pick(targets);
      if (Math.random() < COP_HIT_CHANCE) {
        target.bodyPart = pick(BODY_PARTS);
        target.state = 'dead';
        if (target.breakTarget != null) target.breakTarget = null;
        if (c.displayPos && target.displayPos) {
          spawnBullets(c.displayPos.x, c.displayPos.y,
            target.displayPos.x, target.displayPos.y, 'pistol', '#5a8acc');
        }
        log(copKillNarrative(c, target), 'copkill');
        if (global.RaidAudio) {
          RaidAudio.copShot();
          setTimeout(() => RaidAudio.atkDown(), 80);
        }
      } else {
        // spray a few rounds toward (but past) the target on a miss
        if (c.displayPos && target.displayPos) {
          for (let s = 0; s < COP_SPRAY; s++) {
            spawnBullets(c.displayPos.x, c.displayPos.y,
              target.displayPos.x + (Math.random() - 0.5) * 30,
              target.displayPos.y + (Math.random() - 0.5) * 30,
              'pistol', '#5a8acc');
          }
        }
        log(copMissNarrative(c, target), 'copmiss');
        if (global.RaidAudio) RaidAudio.copShot();
      }
    }
  }

  function copsMove() {
    for (const c of cops) {
      if (c.state === 'dead' || c.room == null) continue;
      const targetInRoom = attackers.some(a =>
        a.state !== 'dead' && a.state !== 'escaped' && a.room === c.room);
      if (targetInRoom) continue;
      const targetRooms = new Set(liveAttackers().map(a => a.room));
      if (!targetRooms.size) continue;
      const next = bfsNextHop(building.adj, c.room,
        id => targetRooms.has(id),
        id => isBarricaded(id));
      if (next != null && next !== c.room) {
        c.lastRoom = c.room;
        c.room = next;
        const tgt = copTargetPos(c);
        if (tgt) startMoveAnim(c, tgt.x, tgt.y);
        log(copMoveNarrative(c), 'copmove');
      }
    }
  }

  // --- pawn movement -----------------------------------------------------

  function movePawns() {
    const exits = exitRoomIds();
    const escapees = [];
    let hopped = 0;
    for (const p of pawns) {
      if (p.state !== 'fleeing') continue;
      if (p.cooldown > 0) { p.cooldown--; continue; }
      if (exits.has(p.room) && Building.isRoom(building, p.room)) {
        p.state = 'escaped';
        const exit = building.exits.find(e => e.roomId === p.room);
        if (exit) {
          p.pos = { x: exit.anchor.x, y: exit.anchor.y };
          startMoveAnim(p, p.pos.x, p.pos.y);
        }
        const exitIdx = exit ? building.exits.indexOf(exit) : 0;
        escapees.push({ p, exitIdx });
        continue;
      }
      // Pawns won't willingly cross through an attacker's room unless it's the
      // only path out. First try a path that avoids both barricades and rooms
      // occupied by live attackers; fall back to allowing attacker rooms only
      // if no safe path exists.
      const attackerRooms = new Set(liveAttackers().map(a => a.room));
      let next = bfsNextHop(building.adj, p.room,
        id => exits.has(id) && Building.isRoom(building, id),
        id => isBarricaded(id) || attackerRooms.has(id));
      if (next == null) {
        next = bfsNextHop(building.adj, p.room,
          id => exits.has(id) && Building.isRoom(building, id),
          id => isBarricaded(id));
      }
      if (next != null && next !== p.room) {
        p.lastRoom = p.room;
        p.room = next;
        const r = roomObj(next);
        if (r) p.pos = Building.randInRoom(r);
        startMoveAnim(p, p.pos.x, p.pos.y);
        p.cooldown = PAWN_HOP_COOLDOWN;
        hopped++;
      }
    }
    if (hopped) {
      log(fleeNarrative(hopped), 'flee');
      if (global.RaidAudio) RaidAudio.flee();
    }
    escapees.forEach((esc, i) => {
      log(escapeNarrative(esc.p, esc.exitIdx), 'escape');
      if (global.RaidAudio) setTimeout(() => RaidAudio.escape(), i * 80);
    });
  }

  // --- step --------------------------------------------------------------

  function step() {
    if (gameOver) return;
    if (!liveAttackers().length) {
      if (placedAttackers().length) { checkEnd(); }
      return;
    }
    if (!commitWager()) {
      pause();
      log('Insufficient coins for wager. Place a smaller stake.', 'startle');
      if (wagerInputEl) wagerInputEl.focus();
      return;
    }
    turn++;
    // Cop arrivals: wave 1 = 1 unit, wave 2 = 2, wave 3 = 3, then 3 per wave.
    if (!copsArrived && turn >= copsArrivalTick) {
      copsArrived = true;
      copsWaveNum = 1;
      const wave = spawnCopWave(COP_WAVE_SIZES[0]);
      if (wave.length) {
        log(copsArrivalNarrative(), 'cops');
        if (global.RaidAudio) RaidAudio.cops();
        for (const c of wave) log(copEntryNarrative(c), 'copmove');
      }
      scheduleNextCopWave();
    } else if (copsArrived && copsNextWaveTick != null &&
               turn >= copsNextWaveTick && cops.length < MAX_COPS) {
      copsWaveNum++;
      const size = copsWaveNum <= COP_WAVE_SIZES.length
        ? COP_WAVE_SIZES[copsWaveNum - 1]
        : COP_WAVE_SIZES[COP_WAVE_SIZES.length - 1];
      const wave = spawnCopWave(size);
      if (wave.length) {
        log(reinforcementNarrative(wave.length, wave), 'cops');
        if (global.RaidAudio) RaidAudio.cops();
        for (const c of wave) log(copEntryNarrative(c), 'copmove');
      }
      scheduleNextCopWave();
    }

    const r = reactPawns();
    if (r.fled) {
      log(startleNarrative(r.fled), 'startle');
      if (global.RaidAudio) RaidAudio.startle();
    }
    if (r.frozen) {
      log(freezeNarrative(r.frozen), 'startle');
    }
    const c = chainPanic();
    if (c) log(chainPanicNarrative(c), 'startle');

    if (copsArrived) copsAct();

    for (const a of attackers) attackerAct(a);

    movePawns();

    const c2 = chainPanic();
    if (c2) log(chainPanicNarrative(c2), 'startle');

    if (copsArrived) copsMove();

    if (!gameOver) ambientTick();

    checkEnd();
    render();
    updateStatus();
    refreshControls();
  }

  function checkEnd() {
    if (gameOver) return true;
    const placed = placedAttackers();
    if (placed.length === 0) return false;
    const stillActive = placed.filter(a =>
      a.state !== 'dead' && a.state !== 'escaped');
    if (stillActive.length > 0) return false;

    gameOver = true;
    pause();
    const dead = pawns.filter(p => p.state === 'dead').length;
    const wounded = pawns.filter(p => p.state === 'wounded').length;
    const esc = pawns.filter(p => p.state === 'escaped').length;

    const allDead = placed.every(a => a.state === 'dead');
    const allFled = placed.every(a => a.state === 'escaped');
    if (allDead) {
      log('All angels grounded.', 'overdown', false);
    } else if (allFled) {
      log('All angels ascended.', 'over', false);
    } else {
      log('Visitation concluded.', 'over', false);
    }
    log(statsNarrative(dead, wounded, esc, turn), 'stats');
    for (const line of suspectStatusNarrative()) log(line, 'stats');
    resolveWager();
    if (global.RaidAudio) RaidAudio.clear();
    return true;
  }

  // --- play loop ---------------------------------------------------------

  function play() {
    if (gameOver || !liveAttackers().length) return;
    playing = true;
    playBtn.textContent = 'Pause ❚❚';
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(step, TICK_MS);
    refreshControls();
  }
  function pause() {
    playing = false;
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (playBtn) playBtn.textContent = 'Play ▶';
    refreshControls();
  }
  function togglePlay() { if (playing) pause(); else play(); }

  function refreshControls() {
    const hasLive = liveAttackers().length > 0;
    stepBtn.disabled = gameOver || !hasLive || playing;
    playBtn.disabled = gameOver || !hasLive;
    regenBtn.disabled = playing;
    const allPlaced = nextUnplacedIdx() < 0;
    for (const btn of exitsHost.querySelectorAll('button')) {
      btn.disabled = gameOver || playing || allPlaced;
    }
  }

  // --- log ---------------------------------------------------------------

  function clearLog() { if (logEl) logEl.innerHTML = ''; }
  function log(msg, kind, time) {
    if (!logEl) return;
    const div = document.createElement('div');
    div.className = 'log-entry log-' + (kind || 'react');
    if (time !== false) {
      const ts = document.createElement('span');
      ts.className = 'log-time';
      ts.textContent = (time == null ? formatTime(turn) : time) + '  ';
      div.appendChild(ts);
    }
    const text = document.createElement('span');
    text.className = 'log-text';
    text.textContent = msg;
    div.appendChild(text);
    logEl.appendChild(div);
    while (logEl.childNodes.length > LOG_MAX) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // --- panel render ------------------------------------------------------

  function renderAttackerCards() {
    atkHost.innerHTML = '';
    const nextIdx = nextUnplacedIdx();
    for (let i = 0; i < attackers.length; i++) {
      const a = attackers[i];
      const card = document.createElement('div');
      let cls = 'atk-card';
      if (a.state === 'dead') cls += ' dead';
      else if (a.state === 'escaped') cls += ' placed';
      else if (a.room != null) cls += ' placed';
      else if (i === nextIdx) cls += ' next';
      card.className = cls;

      const g = document.createElement('div');
      g.className = 'atk-glyph';
      g.textContent = a.weapon.glyph;
      g.style.color = a.weapon.color;

      const info = document.createElement('div');
      info.className = 'atk-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'atk-name';
      nameEl.textContent = a.cardName + (i === nextIdx && a.room == null ? '  (next)' : '');
      const wpn = document.createElement('div');
      wpn.className = 'atk-weapon';
      wpn.textContent = 'Angel ' + a.id + ' · ' + a.weapon.name + ' · ' + a.weapon.kills + '/tick';
      info.appendChild(nameEl);
      info.appendChild(wpn);

      const loc = document.createElement('div');
      loc.className = 'atk-loc' + (a.room != null ? ' placed' : '');
      if (a.state === 'dead') loc.textContent = 'DOWN';
      else if (a.state === 'escaped') loc.textContent = 'at large';
      else if (a.state === 'breaking') loc.textContent = 'breaking…';
      else loc.textContent = a.room != null ? roomName(a.room) : '—';

      card.appendChild(g);
      card.appendChild(info);
      card.appendChild(loc);
      atkHost.appendChild(card);
    }
  }

  function renderExitButtons() {
    exitsHost.innerHTML = '';
    if (!building) return;
    for (let i = 0; i < building.exits.length; i++) {
      const e = building.exits[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Drop @ E' + (i + 1) + '  (' + roomName(e.roomId) + ' ' + e.dir + ')';
      btn.addEventListener('click', () => dropNext(i));
      exitsHost.appendChild(btn);
    }
  }

  function updateStatus() {
    let alive = 0, dead = 0, wounded = 0, escaped = 0, shelter = 0, frozen = 0;
    for (const p of pawns) {
      if (p.state === 'dead') dead++;
      else if (p.state === 'wounded') wounded++;
      else if (p.state === 'escaped') escaped++;
      else if (p.state === 'sheltering') shelter++;
      else if (p.state === 'frozen') frozen++;
      else alive++;
    }
    const lines = [];
    lines.push('Turn ' + turn + '  ·  ' + formatTime(turn));
    lines.push('alive ' + alive + '  ·  frozen ' + frozen + '  ·  shelter ' + shelter +
               '  ·  dead ' + dead + '  ·  wounded ' + wounded + '  ·  escaped ' + escaped);
    for (const a of attackers) {
      const tag = a.state === 'dead' ? 'NEUTRALIZED'
                : a.state === 'escaped' ? 'AT LARGE'
                : a.state === 'breaking' ? ('breaking ' + roomName(a.breakTarget))
                : a.room != null ? roomName(a.room) : 'unplaced';
      lines.push(a.cardName + ' (' + a.weapon.name + ')  →  ' + tag);
    }
    if (copsArrived) {
      const cAlive = liveCops().length;
      lines.push('Police: ' + cAlive + '/' + cops.length + ' on site');
    } else if (!gameOver) {
      lines.push('Police: not yet on site');
    }
    if (gameOver) lines.push('— Game over.');
    statusEl.textContent = lines.join('\n');
  }

  // --- animation system --------------------------------------------------

  function attackerTargetPos(a) {
    const r = roomObj(a.room);
    if (!r) return null;
    const off = ATK_OFFSETS[(a.id - 1) % ATK_OFFSETS.length];
    return { x: r.centroid.x + off.dx, y: r.centroid.y + off.dy };
  }
  function copTargetPos(c) {
    const r = roomObj(c.room);
    if (!r) return null;
    const off = COP_OFFSETS[(c.id - 1) % COP_OFFSETS.length];
    return { x: r.centroid.x + off.dx, y: r.centroid.y + off.dy };
  }

  function ensureDisplayPos(entity, x, y) {
    if (!entity.displayPos) entity.displayPos = { x, y };
  }
  function startMoveAnim(entity, toX, toY) {
    if (!entity.displayPos) { entity.displayPos = { x: toX, y: toY }; return; }
    entity.anim = {
      fromX: entity.displayPos.x,
      fromY: entity.displayPos.y,
      toX, toY,
      startMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      durMs: TICK_MS * ANIM_RATIO
    };
  }

  function spawnBullets(fromX, fromY, toX, toY, weaponId, color) {
    const n = WEAPON_SPRAY[weaponId] != null ? WEAPON_SPRAY[weaponId] : 1;
    if (n === 0) {
      // bat: emit a brief impact pulse instead of bullets
      bullets.push({
        impact: true,
        x: toX, y: toY,
        elapsed: 0, life: 240, color: color || '#c8b070'
      });
      return;
    }
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * 14;
      const oy = (Math.random() - 0.5) * 14;
      const stagger = weaponId === 'machinegun' ? i * 55 : Math.random() * 30;
      bullets.push({
        x: fromX, y: fromY,
        tx: toX + ox, ty: toY + oy,
        elapsed: -stagger,
        life: BULLET_LIFE + Math.random() * 80,
        color: color || '#ff6a00',
        startMs: now
      });
    }
  }

  function updateAnimations(now) {
    const dt = lastFrameTime ? Math.min(64, now - lastFrameTime) : 16;
    lastFrameTime = now;

    function tick(entity) {
      if (!entity.anim) return;
      const t = Math.min(1, (now - entity.anim.startMs) / entity.anim.durMs);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      entity.displayPos.x = entity.anim.fromX + (entity.anim.toX - entity.anim.fromX) * e;
      entity.displayPos.y = entity.anim.fromY + (entity.anim.toY - entity.anim.fromY) * e;
      if (t >= 1) entity.anim = null;
    }
    for (const p of pawns) if (p.displayPos) tick(p);
    for (const a of attackers) if (a.displayPos) tick(a);
    for (const c of cops) if (c.displayPos) tick(c);

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.elapsed += dt;
      if (b.elapsed >= b.life) bullets.splice(i, 1);
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      if (b.elapsed < 0) continue;
      if (b.impact) {
        const t = b.elapsed / b.life;
        const alpha = 1 - t;
        const r = 4 + t * 12;
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      const t = Math.min(1, b.elapsed / b.life);
      const cx = b.x + (b.tx - b.x) * t;
      const cy = b.y + (b.ty - b.y) * t;
      const trailT = Math.max(0, t - 0.18);
      const trx = b.x + (b.tx - b.x) * trailT;
      const trY = b.y + (b.ty - b.y) * trailT;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 1 - t * 0.5;
      ctx.beginPath();
      ctx.moveTo(trx, trY);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function frameLoop(now) {
    if (!rafActive) return;
    updateAnimations(now);
    render();
    requestAnimationFrame(frameLoop);
  }

  // --- canvas render -----------------------------------------------------

  function roomCenter(id) {
    const r = roomObj(id);
    return r ? r.centroid : { x: 0, y: 0 };
  }

  function drawBarricades() {
    for (const [roomId, bar] of barricades) {
      if (!bar.active) continue;
      const r = roomObj(roomId);
      if (!r) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(212, 175, 55, 0.08)';
      ctx.fillRect(r.rect.x, r.rect.y, r.rect.w, r.rect.h);
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#d4af37';
      ctx.shadowBlur = 8;
      ctx.strokeRect(r.rect.x + 3.5, r.rect.y + 3.5, r.rect.w - 7, r.rect.h - 7);
      ctx.shadowBlur = 0;
      // small "barred" indicator
      ctx.fillStyle = '#d4af37';
      ctx.font = 'bold 11px "Special Elite", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('⛨', r.rect.x + r.rect.w - 6, r.rect.y + 4);
      ctx.restore();
    }
  }

  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

  function drawEmoji(emoji, x, y, size, glowColor, glowBlur, alpha) {
    ctx.save();
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
    if (glowColor && glowBlur) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowBlur;
    }
    ctx.font = size + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(emoji, x, y);
    ctx.restore();
  }

  function drawPawns() {
    for (const p of pawns) {
      const dx = p.displayPos ? p.displayPos.x : p.pos.x;
      const dy = p.displayPos ? p.displayPos.y : p.pos.y;
      if (p.state === 'escaped') {
        drawEmoji('✨', dx, dy, 14, 'rgba(26,255,127,0.7)', 6);
      } else if (p.state === 'dead') {
        drawEmoji('💀', dx, dy, 16, null, 0, 0.85);
      } else if (p.state === 'wounded') {
        // Looks identical to dead for the on-canvas attacker POV; the truth
        // (still alive, "presumed dead") only shows in the end-stats.
        drawEmoji('💀', dx, dy, 16, null, 0, 0.78);
      } else if (p.state === 'sheltering') {
        drawEmoji('🙏', dx, dy, 16, 'rgba(212,175,55,0.5)', 4);
      } else if (p.state === 'frozen') {
        drawEmoji('🥶', dx, dy, 16, 'rgba(168,200,224,0.7)', 6);
      } else if (p.state === 'fleeing') {
        drawEmoji('😱', dx, dy, 16, 'rgba(255,106,0,0.6)', 5);
      } else {
        // idle demon
        drawEmoji('👿', dx, dy, 16, null, 0);
      }
    }
  }

  function drawCops() {
    if (!copsArrived) return;
    for (const c of cops) {
      if (c.room == null) continue;
      let cx, cy;
      if (c.displayPos) {
        cx = c.displayPos.x; cy = c.displayPos.y;
      } else {
        const r = roomObj(c.room);
        if (!r) continue;
        const off = COP_OFFSETS[(c.id - 1) % COP_OFFSETS.length];
        cx = r.centroid.x + off.dx;
        cy = r.centroid.y + off.dy;
      }
      if (c.state === 'dead') {
        drawEmoji('👮', cx, cy, 20, null, 0, 0.45);
        ctx.strokeStyle = '#5a8acc';
        ctx.lineWidth = 2.2;
        const s = 11;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - s);
        ctx.lineTo(cx + s, cy + s);
        ctx.moveTo(cx + s, cy - s);
        ctx.lineTo(cx - s, cy + s);
        ctx.stroke();
        continue;
      }
      drawEmoji('👮', cx, cy, 22, '#5a8acc', 14);
    }
  }

  // Three angels: cherub (baby), dark archangel, light archangel.
  const ATTACKER_EMOJIS = ['👶', '👼🏿', '👼🏻'];

  function drawAttackers() {
    for (const a of attackers) {
      if (a.room == null) continue;
      if (a.state === 'escaped') continue;
      let cx, cy;
      if (a.displayPos) {
        cx = a.displayPos.x; cy = a.displayPos.y;
      } else {
        const r = roomObj(a.room);
        if (!r) continue;
        const off = ATK_OFFSETS[(a.id - 1) % ATK_OFFSETS.length];
        cx = r.centroid.x + off.dx;
        cy = r.centroid.y + off.dy;
      }
      const emoji = ATTACKER_EMOJIS[(a.id - 1) % ATTACKER_EMOJIS.length];

      if (a.state === 'dead') {
        drawEmoji(emoji, cx, cy, 24, null, 0, 0.45);
        ctx.strokeStyle = a.weapon.color;
        ctx.lineWidth = 3;
        const s = 14;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - s);
        ctx.lineTo(cx + s, cy + s);
        ctx.moveTo(cx + s, cy - s);
        ctx.lineTo(cx - s, cy + s);
        ctx.stroke();
        continue;
      }

      if (a.state === 'breaking' && a.breakTarget != null) {
        const tgt = roomObj(a.breakTarget);
        if (tgt) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 200, 80, 0.9)';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(tgt.centroid.x, tgt.centroid.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      drawEmoji(emoji, cx, cy, 26, a.weapon.color, 14);
    }
  }

  function render() {
    if (!ctx || !building) return;
    Building.draw(ctx, building);
    drawBarricades();
    drawPawns();
    drawCops();
    drawAttackers();
    drawBullets();
  }

  // --- init --------------------------------------------------------------

  function init() {
    canvas = document.getElementById('raid-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    regenBtn = document.getElementById('raid-regen');
    stepBtn = document.getElementById('raid-step');
    playBtn = document.getElementById('raid-play');
    exitsHost = document.getElementById('raid-exits');
    atkHost = document.getElementById('raid-attackers');
    statusEl = document.getElementById('raid-status');
    logEl = document.getElementById('raid-log');

    regenBtn.addEventListener('click', regen);
    stepBtn.addEventListener('click', step);
    playBtn.addEventListener('click', togglePlay);

    wagerInputEl = document.getElementById('raid-wager-input');
    wagerMaxBtn = document.getElementById('raid-wager-max');
    wagerLineEl = document.getElementById('raid-wager-line');
    wagerFinalEl = document.getElementById('raid-wager-final');
    if (wagerLineEl) wagerLineEl.textContent = String(AVG_KILLS);
    if (wagerMaxBtn && wagerInputEl) {
      wagerMaxBtn.addEventListener('click', function () {
        const bal = global.Wallet ? Wallet.getBalance() : 1;
        wagerInputEl.value = String(Math.max(1, bal));
      });
    }
    if (global.Wallet && typeof Wallet.onChange === 'function') {
      Wallet.onChange(function () { syncWagerUI(); });
    }
    syncWagerUI();

    regen();

    // start the continuous animation/render loop
    rafActive = true;
    requestAnimationFrame(frameLoop);
  }

  global.RaidSim = { init, regen, step, togglePlay, dropNext };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);

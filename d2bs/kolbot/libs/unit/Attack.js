(function (require, _delay) {
	const Skills = require('Skills');
	const Precast = require('Precast');
	const GameData = require('GameData');
	const Config = require('Config');
	const ignoreMonster = [];

	Unit.prototype.clear = function (range, spectype) {
		let start = [];
		//ToDo; keep track of the place we are at
		const getUnits_filted = () => getUnits(1, -1)
			.filter(unit =>
				ignoreMonster.indexOf(unit.gid) === -1 // Dont attack those we ignore
				&& unit.hp > 0 // Dont attack those that have no health (catapults and such)
				&& unit.attackable // Dont attack those we cant attack
				&& (
					start.length // If start has a length
						? start.distance < range // If it has a range smaller as from the start point (when using me.clear)
						: getDistance(this, unit) < range // if "me" move, the object doesnt move. So, check distance of object
				)
				&& !checkCollision(me, unit, 0x0)
			)
			.filter(unit => {
				if (!spectype || typeof spectype !== 'number') return true; // No spectype =  all monsters
				return unit.spectype & spectype;
			})
			.sort((a, b) => GameData.monsterEffort(a, a.area).effort - GameData.monsterEffort(b, b.area).effort - ((b.distance - a.distance) / 5))

		let units = getUnits_filted(), unit;
		// If we clear around _me_ we move around, but just clear around where we started
		if (me === this) start = [me.x, me.y];

		if (units) for (; (units = getUnits_filted()) && units.length;) {
			delay(20);
			if (!(unit = units.first())) break; // shouldn't happen but to be sure
			for (let done = false; !done && unit.attackable;) {
				done = !unit.attack();
			}
		}
		return true;
	};

	Unit.prototype.__defineGetter__('attackable', function () {
		if (this.type === 0 && this.mode !== 17 && this.mode !== 0) { //ToDo: build in here a check if player is hostiled
			return true;
		}


		if (this.hp === 0 || this.mode === 0 || this.mode === 12) { // Dead monster
			return false;
		}

		if (this.getStat(172) === 2) {	// Friendly monster/NPC
			return false;
		}

		if (this.charlvl < 1) { // catapults were returning a level of 0 and hanging up clear scripts
			return false;
		}

		if (getBaseStat("monstats", this.classid, "neverCount")) { // neverCount base stat - hydras, traps etc.
			return false;
		}


		// Monsters that are in flight
		if ([110, 111, 112, 113, 144, 608].indexOf(this.classid) > -1 && this.mode === 8) {
			return false;
		}

		// Monsters that are Burrowed/Submerged
		if ([68, 69, 70, 71, 72, 258, 258, 259, 260, 261, 262, 263].indexOf(this.classid) > -1 && this.mode === 14) {
			return false;
		}

		return [sdk.monsters.ThroneBaal].indexOf(this.classid) <= -1;


	});

	Unit.prototype.cast = function (skillId, hand, x, y, item, forcePacket) {
		// In case its called upon an item we own, redirect it to castChargedSkill
		if (this.type === 4 && Object.keys(sdk.storage).map(x => sdk.storage[x]).indexOf(this.location) !== -1) return this.castChargedSkill(skillId, x, y);

		//return Skill.cast(skillId, hand || Skills.hand[skillId], this);
		// Some invalid crap
		switch (true) {
			case me.inTown && !Skills.town[skillId]: // cant cast this in town
			case !item && Skills.manaCost[skillId] > me.mp: // dont have enough mana for this
			case !item && !me.getSkill(skillId, 1): // Dont have this skill
				return false;
			case skillId === undefined:
				throw new Error("Unit.cast: Must supply a skill ID");
		}

		var i, n, clickType, shift;

		hand === undefined && (hand = Skills.hand[skillId]);

		x === undefined && (x = me.x);
		y === undefined && (y = me.y);
		if (!me.setSkill(skillId, hand, item)) return false;

		if (Config.PacketCasting > 1 || forcePacket) {
			if (this === me) {
				Packet.castSkill(hand, x, y);
			} else {
				Packet.unitCast(hand, this);
			}
		} else {
			switch (hand) {
				case 0: // Right hand + No Shift
					clickType = 3;
					shift = 0;

					break;
				case 1: // Left hand + Shift
					clickType = 0;
					shift = 1;

					break;
				case 2: // Left hand + No Shift
					clickType = 0;
					shift = 0;

					break;
				case 3: // Right hand + Shift
					clickType = 3;
					shift = 1;

					break;
			}

			MainLoop:
				for (n = 0; n < 3; n += 1) {
					if (this !== me) {
						clickMap(clickType, shift, this);
					} else {
						clickMap(clickType, shift, x, y);
					}

					delay(20);

					if (this !== me) {
						clickMap(clickType + 2, shift, this);
					} else {
						clickMap(clickType + 2, shift, x, y);
					}

					for (i = 0; i < 8; i += 1) {
						if (me.attacking) {
							break MainLoop;
						}

						delay(20);
					}
				}

			while (me.attacking) {
				delay(10);
			}
		}

		if (Skills.isTimed[skillId]) { // account for lag, state 121 doesn't kick in immediately
			for (i = 0; i < 10; i += 1) {
				if ([4, 9].indexOf(me.mode) > -1) {
					break;
				}

				if (me.getState(121)) {
					break;
				}

				delay(10);
			}
		}

		return true;
	};
	let check = getTickCount();
	Unit.prototype.attack = function () {
		const monsterEffort = GameData.monsterEffort(this, this.area, undefined, undefined, undefined, true);
		print(monsterEffort);
		let populatedAttack = monsterEffort.first();
		const move = (sk = populatedAttack.skill) => {
			if (this.distance > Skills.range[sk] || checkCollision(me, this, 0x4)) {
				if (!this.getIntoPosition(Skills.range[sk] / 3 * 2, 0x4)) {
					ignoreMonster.push(this.gid);
					return false;
				}
			}
		};
		while (monsterEffort && Skills.manaCost[monsterEffort.skill] < me.mp) {
			populatedAttack = monsterEffort.shift();
		}
		if (!populatedAttack) return false; // dont know how to attack this
		let hand = 0;

		if (!this.validSpot) {
			print('INVALID SPOT -- ');
			ignoreMonster.push(this.gid);
			return false;
		}
		let corpse, range;

		//ToDo; every x seconds
		getTickCount() - check > 1000 && (check = getTickCount()) && Precast();
		new Line(me.x, me.y, this.x, this.y, 0x84, true);
		//@ToDo; Here some specific class stuff.
		switch (true) {
			case me.classid === 1: // sorc
				getUnits(2, 'shrine')
					.filter(shrine => shrine.distance <= 25)
					.some(function (shrine) {
						print('getting shrine with telekenis');
						return shrine.cast(sdk.skills.Telekinesis, undefined, undefined, undefined, undefined, true);
					});
				break;
			case me.classid === 2: // necro
				// recast bonearmor
				!me.getState(sdk.states.BoneArmor) && me.cast(sdk.skills.BoneArmor) && me.cast(sdk.skills.BoneArmor);

				// Take care of the curse
				getUnits(1)
					.filter(x => x.attackable)
					.filter(unit => !unit.getState(61))
					.forEach(function (unit) {
						let [x, y] = [unit.x, unit.y], spot;
						if (unit.getState(61)) return; //ToDo; fix here something less specific as lower res curse

						// Move to position if needed
						if ((getDistance(me, unit) > 40 || checkCollision(me, unit, 0x4))) {
							// We cant reach the monster, as it is too far away.
							// However we might can cast something close by.
							spot = unit.bestSpot(60); // get the best spot
							if (!spot) return;
							[x, y] = [spot.x, spot.y];
						}

						// cast lower res aura on the bastard
						me.cast(91, 0, x, y); //ToDo; fix here something less specific as lower res curse
					});

				corpse = getUnit(1, -1, 12);
				range = Math.floor((me.getSkill(74, 1) + 7) / 3);

				if (corpse) for (; corpse.getNext();) {
					if (getDistance(this, corpse) <= range && this.checkCorpse(corpse)) {
						me.cast(74, 0, corpse);
					}
				}
				break;
			case me.classid === 3: //Paladin
				// Recast holyshield
				!me.getState(sdk.states.HolyShield) && me.getSkill(sdk.skills.HolyShield, 1) && me.cast(sdk.skills.HolyShield);

				// If the skill we gonna use is a left skill, we can use an aura with it
				if (getBaseStat('skills', populatedAttack.skill, 'leftskill')) {


				}

				// Be a healer, check for party members around us that have a low health
				let party = getParty();
				if (party) for (let unit; party.getNext();) {// If party member in same area, and can find the unit, that isnt dead, cast holy bolt on thje party member
					party.hp < 60 && party.area === me.area && (unit = getUnits(1, party.name).filter(x => !x.dead).first()) && unit && unit.cast(sdk.skills.HolyBolt);
				}

				if (populatedAttack.skill === sdk.skills.BlessedHammer) {
					if (!require('Paladin').getHammerPosition(this)) return false;
				}
				break;
			case me.classid === 6: // ToDO; make more viable on lower levels / fire assasin
				let baseTrap = me.getSkill(sdk.skills.LightningSentry, 1) && sdk.skills.LightningSentry || me.getSkill(sdk.skills.LightningBolt, 1) && sdk.skills.LightningBolt;
				let traps = [baseTrap, baseTrap, baseTrap, baseTrap, baseTrap]; // We can have 5 traps
				if (me.getSkill(sdk.skills.DeathSentry, 1)) {
					corpse = getUnit(1, -1, 12);
					range = Math.floor(([(9 + me.getSkill(sdk.skills.DeathSentry, 1)) / 2] * 2 / 3 + 7) / 3);

					// Todo; check if its useful to cast a death sentry (no corpses = barely damage)
					if (corpse) for (; corpse.getNext();) {
						if (corpse.distance <= range && corpse.checkCorpse()) {
							traps[0] = sdk.skills.DeathSentry; // Cast a death sentry
							break;
						}
					}
				}

				const map = {
					416: sdk.skills.DeathSentry,
					415: sdk.skills.WakeofInferno,
					412: sdk.skills.LightningSentry,
					411: sdk.skills.ChargedBoltSentry,
					410: sdk.skills.WakeofFire,
				};

				// get a list of _my_ placed traps
				const getPlacedTraps = () => getUnits(sdk.unittype.Monsters) // All monsters (yeah traps are monsters)
					.filter(x => [410, 411, 412, 415, 416].indexOf(x.classid) > -1) // Only those that are traps
					.filter(x => x.mode !== 12); // only alive ones
				//.filter(x=>x.getParent() === me) // only my traps =)
				//.filter(x => checkCollision(x, this, 0x4)); // Only those that dont collide with the current attacking monster

				traps.forEach(trap => {
					const currentTraps = getPlacedTraps(),
						trapid = parseInt(Object.keys(map).find(classid => map[classid] === trap));

					// See if we have the currently amount of traps, we want
					const have = currentTraps.filter(x => x.classid === trapid).length;
					const want = traps.filter(x => x === trap).length;
					if (have < want) {
						move(trap);
						// We dont have enough of this trap
						me.overhead(getSkillById(trap) + ' -- (' + (have + 1) + '/' + want + ')');

						const location = this.bestSpot(5);
						location && me.cast(trap, undefined, location.x, location.y);
					}
				});

				// check regular traps (LigthingSentry
				break;
		}

		if (Config.MercWatch && Town.needMerc()) {
			print("mercwatch");
			Town.visitTown();
		}

		me.overhead(getSkillById(populatedAttack.skill) + ' @ ' + populatedAttack.effort.toFixed(2));

		//ToDo; remove deprecated tag Attack
		move();
		// Paladins have aura's
		if (Skills.hand[populatedAttack.skill] && me.classid === 3) { // Only for skills set on first hand, we can have an aura with it
			// First ask nishi's frame if it is Eligible for conviction, if so, we put conviction on, if we got it obv
			if (GameData.convictionEligible[populatedAttack.type] && GameData.skillLevel(123)) {
				me.getSkill(0) !== 123 && me.setSkill(123, 0);
				hand = 1;
			} else {
				let aura = Skills.aura[populatedAttack.skill];

				// Figure out aura on skill, and set it if we got it
				aura && me.getSkill(aura, 1) && me.setSkill(aura, 0)
			}
		}
		let val = this.attackable && !this.dead && this.cast(populatedAttack.skill);
		_delay(3); // legit delay
		Pickit.pickItems();
		return val;
	};

	Unit.prototype.kill = function () {
		print('Killing ' + this.name);
		let counter = 1;
		while (counter < 3000 && counter++ && this.attackable) if (!this.attack()) break;
		this.attackable && ignoreMonster.push(this.gid);
	};

	Unit.prototype.checkCorpse = function (revive) {
		if (this.mode !== 12) return false;

		var baseId = getBaseStat("monstats", this.classid, "baseid"),
			badList = [312, 571];

		if (
			(
				(this.spectype & 0x7)
				|| badList.indexOf(baseId) > -1
				|| (Config.ReviveUnstackable && getBaseStat("monstats2", baseId, "sizex") === 3)
			) || !getBaseStat("monstats2", baseId, revive ? "revive" : "corpseSel")
		) {
			return false;
		}

		return getDistance(me, this) <= 40 && !checkCollision(me, this, 0x4) &&
			!this.getState(1) && // freeze
			!this.getState(96) && // revive
			!this.getState(99) && // redeemed
			!this.getState(104) && // nodraw
			!this.getState(107) && // shatter
			!this.getState(118);
	}

})(require, delay);
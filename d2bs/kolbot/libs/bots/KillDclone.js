/**
*	@filename	KillDclone.js
*	@author		kolton
*	@desc		Got to Palace Cellar level 3 and kill Diablo Clone.
*/

function KillDclone(Config, Attack) {
	//Town.doChores();
	Pather.useWaypoint(74);
	require('Precast')();

	if (!Pather.usePortal(null)) {
		throw new Error("Failed to move to Palace Cellar");
	}

	Attack.kill(333);
	Pickit.pickItems();

	if (AutoMule.getInfo() && AutoMule.getInfo().hasOwnProperty("torchMuleInfo")) {
		scriptBroadcast("muleAnni");
	}

	return true;
}
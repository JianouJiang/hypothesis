(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let snapshot,
    busy = false;
  const client = new PhysicsGuest.Client(
    (data) => {
      snapshot = data;
      $("aero-balance").textContent = PhysicsGuest.money(data.player.balance);
      $("interest-button").disabled = false;
      $("interest-button").setAttribute(
        "aria-pressed",
        data.player.competitionInterest === true,
      );
      $("interest-button").textContent = data.player.competitionInterest
        ? "✓ Interest saved · Undo"
        : "Save my interest";
    },
    (message) => {
      $("competition-status").textContent = message;
    },
  );
  $("interest-button").onclick = async () => {
    if (!snapshot || busy) return;
    if (client.mode !== "server") {
      $("interest-status").textContent =
        "Connect to the live site to save your interest.";
      return;
    }
    busy = true;
    $("interest-button").disabled = true;
    try {
      const interested = !snapshot.player.competitionInterest;
      const data = await client.api("competition", { interested });
      client.accept(data.snapshot);
      $("interest-status").textContent = interested
        ? "Saved to your guest profile. Event announcements will appear on this page."
        : "Your interest has been removed.";
    } catch (error) {
      $("interest-status").textContent = error.message;
    } finally {
      busy = false;
      $("interest-button").disabled = false;
    }
  };
  for (const kind of ["aerofoil", "galton", "escape"])
    $(kind + "-challenge-art").innerHTML = PhysicsCatalog.svg(kind, true);
  client.start();
})();

#!/bin/bash
# ============================================================================
# RIEGEL: ES GIBT GENAU EINEN WEG ZU PUSHOVER — osg-status
# ============================================================================
# Rot, sobald irgendwo ausserhalb der kanonischen Senderdatei der Endpunkt
# api\.pushover\.net/1/messages\.json direkt aufgerufen wird.
# (Der Endpunkt steht in dieser Datei durchgaengig MASKIERT, auch im
#  Fliesstext — Bedingung der Selbst-Immunitaet weiter unten.)
#
# ---------------------------------------------------------------------------
# HIER GIBT ES KEINE WIEDERHOLUNGSUNTERDRUECKUNG, UND DAS IST DER BEFUND
# ---------------------------------------------------------------------------
# Der Auftrag lautete, den Engpass zu pruefen, nicht ihn zu bauen. Geprueft,
# 2026-08-21, an den beiden einzigen Aufrufern:
#
#   worker/src/util.ts:204   — laeuft nur, wenn `statusChanged` gilt
#   worker/src/index.ts:269  — laeuft nur, wenn die Sonde die Schwelle KREUZT
#                              (`probe.crossed`), nicht solange sie darueber
#                              liegt
#
# Beide sind FLANKENGESTEUERT. Sie melden einen UEBERGANG, nicht einen
# Zustand. Damit haben sie bereits eine Wiederholungssperre, und zwar eine
# SCHAERFERE als ein Zeitfenster ueber den Inhalt: sie meldet gar nicht erst
# wieder, statt Wiederholungen nachtraeglich zusammenzufassen.
#
# EIN ZUSTANDSSPEICHER WAERE DA (D1-Bindung UPTIMEFLARE_D1) — die Sperre
# scheitert also nicht an der Technik, und dieser Satz steht hier, damit
# niemand die bequeme Begruendung wiederholt. Sie waere trotzdem falsch:
#
#   1. Eine zweite Sperre ueber eine bestehende macht unvorhersagbar, welche
#      greift. Das steht so im Kopf von osg_alarm_senden_einmal im Kern.
#   2. SIE WAERE HIER SOGAR SCHAEDLICH. Ein Flattern — DOWN, Erholung, wieder
#      DOWN innerhalb von sechs Stunden — traegt beim zweiten DOWN denselben
#      Text wie beim ersten. Ein Inhaltsfenster wuerde den zweiten Ausfall
#      VERSCHLUCKEN. Der Empfaenger saehe eine Stoerung und eine Erholung und
#      wuesste nicht, dass es wieder liegt. Aus Entlaermung wuerde
#      Falschauskunft.
#
# WAS STATT DESSEN GEBAUT IST: dieser Riegel. Er haelt die Einwegigkeit fest,
# damit der naechste Melder nicht wieder selbst fetcht — das ist der Teil des
# Auftrags, der hier eine Wirkung hat.
#
# OFFEN und ausdruecklich NICHT behoben: schlaegt das Schreiben des Zustands
# fehl, koennte derselbe Ausfall erneut als Flanke erscheinen. Dann meldete
# er mehrfach. Das ist ein Fehler der ZUSTANDSSCHREIBUNG, nicht der
# Meldeform — und er gehoert dort repariert, nicht hier zugedeckt.
#
# ---------------------------------------------------------------------------
# REICHWEITE — was abgesucht wird (und was NICHT)
# ---------------------------------------------------------------------------
# ABGESUCHT: der gesamte Arbeitsbaum ab der Repo-Wurzel, ausgenommen
#   .git/ node_modules/ dist/ build/ .next/ coverage/.
# Die durchsuchte ANZAHL steht in der Ausgabe: eine Aussage ueber Abwesenheit
# ohne genannte Grundmenge ist keine Aussage.
# NICHT ABGESUCHT und darum NICHT gedeckt: der Mac Mini und die anderen Repos
# (openshopgraph, openshopgraph2, openshopgraph-frontend-v2). Der Riegel im
# Kern (PR #344) behauptet seinerseits nichts ueber dieses hier.
#
# WARUM ER NICHT AN SICH SELBST SCHEITERT
# Keine Pfad-Ausnahme fuer sich selbst. Sein Muster traegt maskierte Punkte
# (`\.`), die den Backslash davor nicht finden. Belegt in
# ops/test/pushover-einweg.selftest.sh, Fall (e).
[ -n "${BASH_VERSION:-}" ] || exec /bin/bash "$0" "$@"
set -euo pipefail
set -o pipefail

# EINE Ebene hoch, nicht zwei: dieses Skript liegt in ops/, nicht in
# ops/mini/ wie sein Geschwister im Frontend-Repo. Mit zwei Ebenen zeigte es
# auf das ELTERNVERZEICHNIS aller Arbeitsbaeume und meldete 284945 Dateien
# und 60 Verstoesse aus fremden Repos — gemessen, nicht vermutet.
WURZEL="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
# EINE kanonische Senderdatei, und sie ist KEINE Kopie der Kern-Fassung:
# dieser Worker laeuft auf der Cloudflare-Laufzeit, wo es weder eine Schale
# noch ein Dateisystem gibt. worker/src/pushover.ts IST die Sendeform dieses
# Repos — sie war es schon, sie bekommt hier nur einen Riegel, der es
# festhaelt.
KANON_LISTE=(
  "${OSG_PUSHOVER_KANON_TS:-worker/src/pushover.ts}"
)

MUSTER='api\.pushover\.net/1/messages\.json'

# `command grep`/absoluter Pfad ist Absicht: das `grep` einer interaktiven
# Schale kann eine ugrep-Funktion mit `--ignore-files` sein und ueberspringt
# dann stillschweigend alles, was eine .gitignore nennt -- Abwesenheit,
# erzeugt vom Messmittel, in der bequemen Richtung.
GREP=/usr/bin/grep
[ -x "$GREP" ] || GREP="$(command -v grep)"

LISTE="$(mktemp "${TMPDIR:-/tmp}/pushover-einweg.XXXXXX")"
trap 'rm -f "$LISTE"' EXIT
find "$WURZEL" -type f \
  ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/dist/*' \
  ! -path '*/build/*' ! -path '*/.next/*' ! -path '*/coverage/*' \
  -print >"$LISTE"

ANZAHL="$(wc -l <"$LISTE" | tr -d ' ')"

# VAKUUM-TOR. Eine Pruefung ueber einer leeren Zielmenge ist kein Bestehen,
# sondern eine Fehlanzeige. Ohne dieses Tor waere ein falscher Startpfad von
# "alles sauber" nicht zu unterscheiden -- und der Riegel waere am Tag seines
# Versagens gruen.
if [ "$ANZAHL" -lt 40 ]; then
  echo "ROT (Vakuum-Tor): nur ${ANZAHL} Dateien durchsucht unter ${WURZEL}."
  echo "  Das ist ROT, nicht leer: bei so wenigen Dateien misst dieser Lauf"
  echo "  nichts. Erwartet wird ein ausgecheckter Arbeitsbaum dieses Repos."
  exit 2
fi

TREFFER="$(tr '\n' '\0' <"$LISTE" | xargs -0 "$GREP" -lE "$MUSTER" 2>/dev/null || true)"

VERSTOSS=0
echo "Reichweite: ${ANZAHL} Dateien durchsucht ab ${WURZEL}"
echo "Kanonisch (erlaubt): ${KANON_LISTE[*]}"
echo "----"
while IFS= read -r DATEI; do
  [ -n "$DATEI" ] || continue
  REL="${DATEI#"$WURZEL"/}"
  IST_KANON=0
  for K in "${KANON_LISTE[@]}"; do [ "$REL" = "$K" ] && IST_KANON=1; done
  if [ "$IST_KANON" = "1" ]; then
    echo "ok        ${REL} (kanonisch)"
    continue
  fi
  echo "VERSTOSS  ${REL}"
  "$GREP" -nE "$MUSTER" "$DATEI" | sed 's/^/            /'
  VERSTOSS=$((VERSTOSS + 1))
done <<<"$TREFFER"

echo "----"
# Lebendnachweis, unabhaengig vom Verstosszaehler: BEIDE kanonischen Dateien
# MUESSEN unter den Treffern gewesen sein. Sind sie es nicht, hat das Muster
# aufgehoert zu greifen -- und '0 Verstoesse' waere Blindheit statt
# Sauberkeit. Der Nachweis haengt bewusst an etwas, das NICHT verschwinden
# soll (vgl. Kanarienvogel, dessen Ziel das Verschwinden ist).
for K in "${KANON_LISTE[@]}"; do
  if ! printf '%s\n' "$TREFFER" | "$GREP" -q "/${K}\$"; then
    echo "ROT (Lebendnachweis): die kanonische Senderdatei ${K} wurde vom"
    echo "  Suchmuster NICHT getroffen. Das Muster greift also nicht mehr."
    echo "  '0 Verstoesse' waere hier Blindheit, kein Ergebnis."
    exit 2
  fi
done

if [ "$VERSTOSS" -gt 0 ]; then
  echo "ROT: ${VERSTOSS} Datei(en) rufen den Pushover-Endpunkt direkt auf."
  echo "  FOLGE FUER DEN BETRIEB: diese Melder gehen an der"
  echo "  Wiederholungsunterdrueckung VORBEI. Sie sind fuer jede Entlaermung"
  echo "  unsichtbar, und ein 'ruhiges' Alarmprotokoll sagt nichts ueber sie."
  echo "  Weg: pushoverNotify aus worker/src/pushover.ts benutzen."
  exit 1
fi

echo "GRUEN: genau ein Weg zu Pushover (${KANON_LISTE[0]}), 0 Ausnahmen,"
echo "       ${ANZAHL} Dateien geprueft."

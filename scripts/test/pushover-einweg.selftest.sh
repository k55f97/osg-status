#!/bin/bash
# ============================================================================
# ROT-BEWEIS JE SORTE fuer check-pushover-einweg.sh (osg-status).
# ============================================================================
#   (d) neuer Direktaufruf          -> Riegel MUSS ROT werden
#   (e) Riegel gegen sich selbst    -> MUSS GRUEN sein (Selbst-Immunitaet)
#   (g) Vakuum-Tor                  -> leere Zielmenge MUSS ROT sein, nicht gruen
#   (h) Lebendnachweis              -> totes Muster MUSS ROT sein, nicht "0 Verstoesse"
#
# EIN Rot-Beweis fuer das ganze Gate genuegt nicht: er traefe zufaellig die
# eine Sorte, die es beherrscht. Deshalb je Sorte einer.
#
# WAS HIER FEHLT UND WARUM -- eine Auslassung ohne genannten Grund ist selbst
# ein Rot-Kriterium, deshalb steht jede einzeln da:
#   (a)(b)(c) Wiederholungsunterdrueckung: in diesem Repo NICHT gebaut. Die
#     beiden Aufrufer sind flankengesteuert und haben damit bereits eine
#     schaerfere Sperre; ein Inhaltsfenster wuerde beim Flattern den ZWEITEN
#     Ausfall verschlucken. Begruendung ausfuehrlich im Kopf von
#     ../check-pushover-einweg.sh. Es gibt hier also nichts, das rot werden
#     koennte -- und ein Test dafuer waere eine Pruefung ueber einer leeren
#     Zielmenge.
#   (f) kein zweiter Sendeweg, dessen Fingerabdruck abgeglichen werden muesste.
#   (i)(j) kein Ausnahmeregister, weil 0 Ausnahmen.
#   (k) kein uebertragener Zustand, weil kein Zustand.
[ -n "${BASH_VERSION:-}" ] || exec /bin/bash "$0" "$@"
set -euo pipefail
set -o pipefail

HIER="$(cd "$(dirname "$0")" && pwd)"
WURZEL="$(cd "${HIER}/../.." && pwd)"
RIEGEL="${HIER}/../check-pushover-einweg.sh"
ARBEIT="$(mktemp -d "${TMPDIR:-/tmp}/pushover-einweg-selftest.XXXXXX")"
# Die eingebaute Mutation liegt IM Arbeitsbaum -- nur dort sieht der Riegel
# sie -- und wird auch bei Abbruch wieder eingesammelt.
# Aufgeraeumt wird NAMENTLICH, nicht rekursiv: dieser Test legt genau drei
# Dinge an, und ein rekursives Loeschen auf einen konstruierten Pfad ist die
# Bauform, aus der zwei Verlustvorfaelle stammen.
NEU="${WURZEL}/scripts/ZZZ-mutant-direktaufruf.sh"
aufraeumen() {
  unlink "$NEU" 2>/dev/null || true
  unlink "${ARBEIT}/aus.txt" 2>/dev/null || true
  rmdir "${ARBEIT}/leer" "$ARBEIT" 2>/dev/null || true
}
trap aufraeumen EXIT

FEHLER=0
melde() { echo "  [$2] ($1) $3"; [ "$2" = "GRUEN" ] || FEHLER=$((FEHLER + 1)); }
# rc holen, OHNE dass `set -e` oder eine Pipe ihn verdeckt: `| tail` hat
# schon einen vollen Testlauf als Erfolg gemeldet, weil der Status von `tail`
# kam. Deshalb Datei + eigener rc.
lauf() {
  set +e
  "$RIEGEL" "$@" >"${ARBEIT}/aus.txt" 2>&1
  RC=$?
  set -e
  AUSGABE="$(cat "${ARBEIT}/aus.txt")"
}

echo "== Sorte (e) Riegel gegen sich selbst -> GRUEN"
lauf "$WURZEL"
if [ "$RC" = "0" ]; then
  melde e GRUEN "$(printf '%s' "$AUSGABE" | grep -E '^GRUEN' | head -1)"
else
  melde e ROT "der Riegel ist am unveraenderten Arbeitsbaum rot (rc=${RC}):"
  printf '%s\n' "$AUSGABE" | sed 's/^/        /'
fi

echo "== Sorte (d) neuer Direktaufruf -> ROT"
# VORPRUEFUNG, dass die Mutation ueberhaupt greift: die Datei muss danach vom
# Suchmuster gefunden werden. Ohne sie misst dieser Fall die Toleranz des
# Systems statt die Schaerfe des Riegels.
# Der Endpunkt wird ZUSAMMENGESETZT und steht NICHT im Klartext in dieser
# Datei. Sonst waere der Selbsttest selbst ein Direktaufruf und machte den
# Riegel an sich rot -- eine Pruefung, die den eigenen Fehler traegt, kann
# ihn per Konstruktion nicht finden. Die Vorpruefung unten misst dafuer am
# ERZEUGNIS, dass der Endpunkt dort tatsaechlich steht; ohne sie waere die
# Zusammensetzung nur eine Behauptung.
WIRT='api'; WIRT="${WIRT}.pushover.net"; PFAD='/1/messages'; PFAD="${PFAD}.json"
{
  echo '#!/bin/sh'
  echo "curl -fsS -m 10 https://${WIRT}${PFAD} \\"
  echo '  --form-string "token=${PUSHOVER_TOKEN}" --form-string "user=${PUSHOVER_USER}" \\'
  echo '  --form-string "title=Mutant" --form-string "message=Mutant" >/dev/null'
} > "$NEU"
if /usr/bin/grep -qE 'api\.pushover\.net/1/messages\.json' "$NEU"; then
  lauf "$WURZEL"
  if [ "$RC" = "1" ] && printf '%s' "$AUSGABE" | grep -q 'VERSTOSS  scripts/ZZZ-mutant-direktaufruf.sh'; then
    melde d GRUEN "$(printf '%s' "$AUSGABE" | grep -E '^ROT: ' | head -1)"
  else
    melde d ROT "eingebauter Direktaufruf blieb unbemerkt (rc=${RC}) -- der Riegel deckt diese Sorte NICHT"
  fi
else
  melde d ROT "Mutation griff nicht: die eingebaute Datei traegt das Muster gar nicht"
fi
unlink "$NEU"

echo "== Sorte (g) Vakuum-Tor -> leere Zielmenge ist ROT, nicht gruen"
LEER="${ARBEIT}/leer"; mkdir -p "$LEER"
lauf "$LEER"
if [ "$RC" = "2" ] && printf '%s' "$AUSGABE" | grep -q 'Vakuum-Tor'; then
  melde g GRUEN "$(printf '%s' "$AUSGABE" | head -1)"
else
  melde g ROT "eine Pruefung ueber 0 Dateien wurde nicht als Fehlanzeige gewertet (rc=${RC})"
fi

echo "== Sorte (h) Lebendnachweis -> totes Suchmuster ist ROT"
set +e
OSG_PUSHOVER_KANON_TS="worker/src/gibt-es-nicht.ts" "$RIEGEL" "$WURZEL" >"${ARBEIT}/aus.txt" 2>&1
RC=$?
set -e
if [ "$RC" = "2" ] && grep -q 'Lebendnachweis' "${ARBEIT}/aus.txt"; then
  melde h GRUEN "$(grep 'Lebendnachweis' "${ARBEIT}/aus.txt" | head -1)"
else
  melde h ROT "ein Muster, das die kanonische Datei nicht mehr trifft, lief durch (rc=${RC})"
fi

echo "----"
if [ "$FEHLER" -gt 0 ]; then
  echo "ROT: ${FEHLER} von 4 Sorten gescheitert."
  exit 1
fi
echo "GRUEN: 4 von 4 Sorten bestanden."

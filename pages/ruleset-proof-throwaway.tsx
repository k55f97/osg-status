// THROWAWAY — proof that required_status_checks actually blocks a merge.
// Contains a deliberate type error so `build` cannot go green.
// This PR is closed and this branch deleted immediately after the measurement.
export default function RulesetProof() {
  const blocked: number = 'this is not a number'
  return <div>{blocked}</div>
}

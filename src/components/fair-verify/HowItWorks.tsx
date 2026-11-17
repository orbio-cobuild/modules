/** Plain-English explanation of commit-reveal, for the verify page. */
export function HowItWorks({ noun = 'round' }: { noun?: string }) {
  return (
    <section className="flex flex-col gap-2 text-sm text-muted-foreground">
      <h2 className="text-base font-medium text-foreground">How this is fair</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Before each {noun.toLowerCase()}, the game publishes a fingerprint (commitment) of a secret seed on-chain. It can't change the seed afterwards.</li>
        <li>The {noun.toLowerCase()} locks at a future block. Nobody, including the game, knows that block's hash in advance.</li>
        <li>After the lock, the seed is revealed and mixed with the block hash to produce the result.</li>
        <li>This page re-does that math in your browser from data on the chain, so you don't have to trust us.</li>
      </ol>
      <p>
        Limits: this protects you against the game operator. It is not a VRF; someone controlling the network's block producer together with the
        operator could bias a result. If a {noun.toLowerCase()} is never revealed, the app must treat it as cancelled.
      </p>
    </section>
  )
}

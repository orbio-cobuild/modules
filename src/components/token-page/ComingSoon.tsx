export function ComingSoon({ name, symbol, message }: { name?: string; symbol?: string; message: string }) {
  return (
    <section className="rounded-lg border border-dashed bg-card p-8 text-center text-card-foreground">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Coming soon</p>
      {(name || symbol) && (
        <h2 className="mt-2 text-2xl font-semibold">
          {name}
          {symbol && <span className="ml-2 text-muted-foreground">${symbol}</span>}
        </h2>
      )}
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">{message}</p>
    </section>
  )
}

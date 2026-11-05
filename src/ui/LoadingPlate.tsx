export function LoadingPlate() {
  return (
    <div role="status" className="absolute inset-0 grid place-items-center">
      <div className="text-center">
        <p className="animate-pulse font-display text-5xl italic">Corpus</p>
        <p className="eyebrow mt-3">Preparing the body</p>
      </div>
    </div>
  )
}

type LoadingStateProps = {
  title?: string;
  description?: string;
};

export function LoadingState({
  description = "Please wait while the application prepares this view.",
  title = "Loading",
}: LoadingStateProps) {
  return (
    <div className="loading-state">
      <div aria-hidden="true" className="loading-state__spinner" />
      <div>
        <h2 className="loading-state__title">{title}</h2>
        <p className="loading-state__description">{description}</p>
      </div>
    </div>
  );
}

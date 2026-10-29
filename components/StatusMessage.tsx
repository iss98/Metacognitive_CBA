export function StatusMessage({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <div className={error ? "status-message error" : "status-message"} role={error ? "alert" : "status"}>
      {error ?? message}
    </div>
  );
}


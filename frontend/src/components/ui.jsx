import { statusMeta } from '../status.js';

export function StatusBadge({ value, label }) {
  const meta = statusMeta(value);
  return (
    <span className={`badge tone-${meta.tone}`}>
      <span className="badge-icon" aria-hidden="true">{meta.icon}</span>
      {label ?? meta.label}
    </span>
  );
}

export function StatTile({ label, value, sub, tone }) {
  return (
    <div className={`stat-tile ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, children }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {children && <div className="page-header-side">{children}</div>}
    </div>
  );
}

export function Chip({ children, tone }) {
  return <span className={`chip ${tone ? `chip-${tone}` : ''}`}>{children}</span>;
}

export function Card({ title, actions, children, className = '', tone }) {
  return (
    <section className={`card ${tone ? `card-${tone}` : ''} ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="state-msg">{label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state-msg error">
      <strong>{error.status === 403 ? 'Access denied' : 'Something went wrong'}</strong>
      <span>{error.message}</span>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function DataTable({ columns, rows, sort, onSort, onRowClick, empty = 'No rows', rowKey = 'report_id' }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} className={c.align === 'right' ? 'num' : ''} aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {onSort && c.sortable !== false ? (
                    <button className="th-sort" onClick={() => onSort(c.key)}>
                      {c.label}
                      <span className="sort-ind">{active ? (sort.order === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="muted center">{empty}</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'clickable' : ''}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

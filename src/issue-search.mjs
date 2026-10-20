export const modeLabels = {
  browser: 'Modelo en navegador',
  precomputed: 'Resultados precalculados',
};

export function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterIssues(issues, solutions, query = '', mode = 'all') {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return issues.filter((issue) => {
    if (mode !== 'all' && issue.mode !== mode) return false;
    const authors = solutions
      .filter((solution) => solution.issue === issue.number)
      .map((solution) => solution.author);
    const text = normalize(
      [issue.title, issue.summary, modeLabels[issue.mode], ...authors].join(' '),
    );
    return terms.every((term) =>
      /^#?\d+$/.test(term)
        ? (issue.displayNumber ?? issue.number) === Number(term.replace('#', ''))
        : text.includes(term),
    );
  });
}

export function groupIssues(issues) {
  return {
    open: issues.filter((issue) => issue.state === 'open'),
    closed: issues.filter((issue) => issue.state === 'closed'),
  };
}

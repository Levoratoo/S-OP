/** Download do Excel oficial do job (mesmo arquivo em disco / listagem / visualização). */
export function downloadPrevisaoJobExcel(jobId: number) {
  if (!Number.isInteger(jobId) || jobId <= 0) return;
  window.location.assign(`/api/previsao-python/jobs/${jobId}/file`);
}

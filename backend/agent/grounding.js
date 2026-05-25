// Grounding check — hang rao chong "bia thong tin" (hallucination).
// Loai bo cac item ma evidence_quote/quote KHONG thuc su xuat hien trong transcript.
// Doc lap voi LLM: du model bia, neu quote khong bam transcript thi bi chan o day.

// Chuan hoa tieng Viet: bo dau, lowercase, gom khoang trang, bo ky tu dac biet.
function normalizeVi(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // bo dau
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Quote co "bam" transcript khong: it nhat 1 cum minRun tu lien tiep xuat hien trong transcript.
// Quote ngan hon minRun tu -> phai khop toan bo.
function isGrounded(quote, normTranscript, minRun = 4) {
  const words = normalizeVi(quote).split(" ").filter(Boolean);
  if (words.length === 0) return false;        // khong co quote -> coi nhu bia
  if (words.length < minRun) return normTranscript.includes(words.join(" "));
  for (let i = 0; i + minRun <= words.length; i++) {
    if (normTranscript.includes(words.slice(i, i + minRun).join(" "))) return true;
  }
  return false;
}

// Loc item bia trong needs + opportunity. Sua analysis tai cho (mutate) + tra ve report.
function groundInsights(analysis, transcript) {
  const normT = normalizeVi(transcript);
  const report = { needs_dropped: 0, opp_dropped: 0, details: [] };

  const filterByQuote = (arr, quoteField, label) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter(item => {
      const ok = isGrounded(item && item[quoteField], normT);
      if (!ok) report.details.push(`${label}: "${String(item && item[quoteField]).slice(0, 45)}"`);
      return ok;
    });
  };

  const ne = analysis && analysis.needs;
  if (ne && !ne.error) {
    for (const f of ["medical_conditions", "current_medications", "unmet_needs"]) {
      if (Array.isArray(ne[f])) {
        const before = ne[f].length;
        ne[f] = filterByQuote(ne[f], "evidence_quote", `needs.${f}`);
        report.needs_dropped += before - ne[f].length;
      }
    }
  }

  const op = analysis && analysis.opportunity;
  if (op && !op.error) {
    for (const f of ["buying_signals", "objections"]) {
      if (Array.isArray(op[f])) {
        const before = op[f].length;
        op[f] = filterByQuote(op[f], "quote", `opp.${f}`);
        report.opp_dropped += before - op[f].length;
      }
    }
  }

  return report;
}

module.exports = { normalizeVi, isGrounded, groundInsights };

import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalysisStore } from '../../store/analysisStore';
import { useProcessStore } from '../../store/processStore';
import type { CorpusDocument } from '../../types';

type FactorDimension = 'category' | 'author' | 'language' | 'tag';
type CsvValue = string | number | boolean | null | undefined;

interface Props {
  documents: CorpusDocument[];
}

interface DocumentFrameRow {
  document_id: string;
  document: string;
  category: string;
  author: string;
  language: string;
  tags: string;
  date: string;
  characters: number;
  words: number;
  [key: string]: string | number;
}

interface DescriptiveRow {
  group: string;
  documents: number;
  total: number;
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  hitDocuments: number;
  perThousandWords: number;
}

interface CorrelationRow {
  left: string;
  right: string;
  pearson: number;
  spearman: number;
  n: number;
}

interface CategoryEffectRow {
  group: string;
  factor: string;
  level: string;
  documents: number;
  total: number;
  mean: number;
  presence: number;
  chiSquare: number;
  df: number;
  pValue: number;
  cramersV: number;
  etaSquared: number;
}

interface TrendRow {
  group: string;
  n: number;
  slope: number;
  intercept: number;
  rSquared: number;
  firstValue: number;
  lastValue: number;
}

interface ModelRow {
  group: string;
  factor: FactorDimension;
  n: number;
  levels: number;
  fStatistic: number;
  dfBetween: number;
  dfWithin: number;
  fPValue: number;
  etaSquared: number;
  omegaSquared: number;
  kruskalH: number;
  kruskalPValue: number;
  epsilonSquared: number;
}

const factorDimensions: FactorDimension[] = ['category', 'author', 'language', 'tag'];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countTerms(text: string, terms: string[]) {
  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .reduce((sum, term) => {
      const matches = text.match(new RegExp(escapeRegExp(term), 'giu'));
      return sum + (matches?.length ?? 0);
    }, 0);
}

function wordCount(text: string) {
  return text.match(/[\p{L}\p{M}\p{N}_-]+/gu)?.length ?? 0;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function pearson(left: number[], right: number[]) {
  const n = Math.min(left.length, right.length);
  if (n < 2) return 0;
  const xs = left.slice(0, n);
  const ys = right.slice(0, n);
  const xMean = mean(xs);
  const yMean = mean(ys);
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let index = 0; index < n; index += 1) {
    const xDelta = xs[index] - xMean;
    const yDelta = ys[index] - yMean;
    covariance += xDelta * yDelta;
    xVariance += xDelta ** 2;
    yVariance += yDelta ** 2;
  }
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator ? covariance / denominator : 0;
}

function ranks(values: number[]) {
  const ranked = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const output = Array(values.length).fill(0);
  for (let index = 0; index < ranked.length;) {
    let end = index + 1;
    while (end < ranked.length && ranked[end].value === ranked[index].value) end += 1;
    const rank = (index + end + 1) / 2;
    for (let cursor = index; cursor < end; cursor += 1) output[ranked[cursor].index] = rank;
    index = end;
  }
  return output;
}

function spearman(left: number[], right: number[]) {
  return pearson(ranks(left), ranks(right));
}

function linearRegression(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, rSquared: 0 };
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const xMean = mean(x);
  const yMean = mean(y);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (x[index] - xMean) * (y[index] - yMean);
    denominator += (x[index] - xMean) ** 2;
  }
  const slope = denominator ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;
  const r = pearson(x, y);
  return { slope, intercept, rSquared: r ** 2 };
}

function betaContinuedFraction(a: number, b: number, x: number) {
  const maxIterations = 100;
  const epsilon = 3e-7;
  const fpMin = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const m2 = 2 * iteration;
    let numerator = (iteration * (b - iteration) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + numerator / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;

    numerator = (-(a + iteration) * (qab + iteration) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + numerator / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }

  return h;
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  let x = 0.9999999999998099;
  const z = value - 1;
  coefficients.forEach((coefficient, index) => {
    x += coefficient / (z + index + 1);
  });
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (factor * betaContinuedFraction(a, b, x)) / a;
  return 1 - (factor * betaContinuedFraction(b, a, 1 - x)) / b;
}

function regularizedGammaP(a: number, x: number) {
  if (x <= 0) return 0;
  let sum = 1 / a;
  let value = sum;
  for (let n = 1; n < 100; n += 1) {
    value *= x / (a + n);
    sum += value;
    if (Math.abs(value) < Math.abs(sum) * 1e-12) break;
  }
  return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - logGamma(a)));
}

function regularizedGammaQ(a: number, x: number) {
  if (x <= 0) return 1;
  if (x < a + 1) return 1 - regularizedGammaP(a, x);
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let index = 1; index < 100; index += 1) {
    const an = -index * (index - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return Math.max(0, Math.min(1, Math.exp(-x + a * Math.log(x) - logGamma(a)) * h));
}

function chiSquarePValue(statistic: number, df: number) {
  if (!Number.isFinite(statistic) || statistic < 0 || df <= 0) return 1;
  return regularizedGammaQ(df / 2, statistic / 2);
}

function fPValue(fStatistic: number, dfBetween: number, dfWithin: number) {
  if (fStatistic === Number.MAX_VALUE) return 0;
  if (!Number.isFinite(fStatistic) || fStatistic < 0 || dfBetween <= 0 || dfWithin <= 0) return 1;
  const x = (dfBetween * fStatistic) / (dfBetween * fStatistic + dfWithin);
  return 1 - regularizedBeta(x, dfBetween / 2, dfWithin / 2);
}

function sanitizeColumnName(value: string) {
  const cleaned = value.trim().replace(/[^\p{L}\p{M}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'group';
}

function formatNumber(value: number, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.000';
}

function toCsv(rows: Array<Record<string, CsvValue>>) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: CsvValue) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function factorValues(document: CorpusDocument, dimension: FactorDimension) {
  if (dimension === 'tag') return document.metadata.tags.length ? document.metadata.tags : ['untagged'];
  return [String(document.metadata[dimension] ?? '').trim() || 'unknown'];
}

function makeRScript(groupColumns: string[], factorDimension: FactorDimension) {
  const columns = groupColumns.map((column) => `"${column}"`).join(', ');
  return `# BKI R statistical workbench
# Export bki-r-document-frame.csv from BKI into the same folder, then run this script.
library(readr)
library(dplyr)
library(tidyr)

df <- read_csv("bki-r-document-frame.csv", show_col_types = FALSE)
keyword_cols <- c(${columns})

descriptives <- df |>
  summarise(across(all_of(keyword_cols), list(
    mean = ~mean(.x, na.rm = TRUE),
    median = ~median(.x, na.rm = TRUE),
    sd = ~sd(.x, na.rm = TRUE),
    min = ~min(.x, na.rm = TRUE),
    max = ~max(.x, na.rm = TRUE)
  )))

cor_pearson <- cor(df[keyword_cols], use = "pairwise.complete.obs", method = "pearson")
cor_spearman <- cor(df[keyword_cols], use = "pairwise.complete.obs", method = "spearman")

long <- df |>
  pivot_longer(all_of(keyword_cols), names_to = "keyword_group", values_to = "count")

category_models <- long |>
  group_by(keyword_group, ${factorDimension}) |>
  summarise(documents = n(), total = sum(count), mean = mean(count), .groups = "drop")

trend_models <- lapply(keyword_cols, function(column) {
  model <- lm(df[[column]] ~ seq_along(df[[column]]))
  data.frame(
    keyword_group = column,
    slope = coef(model)[2],
    intercept = coef(model)[1],
    r_squared = summary(model)$r.squared
  )
}) |> bind_rows()

anova_models <- lapply(keyword_cols, function(column) {
  formula <- as.formula(paste(column, "~ ${factorDimension}"))
  model <- aov(formula, data = df)
  table <- summary(model)[[1]]
  data.frame(
    keyword_group = column,
    factor = "${factorDimension}",
    f_statistic = table[["F value"]][1],
    p_value = table[["Pr(>F)"]][1]
  )
}) |> bind_rows()

kruskal_models <- lapply(keyword_cols, function(column) {
  test <- kruskal.test(df[[column]] ~ df[["${factorDimension}"]])
  data.frame(
    keyword_group = column,
    factor = "${factorDimension}",
    statistic = unname(test$statistic),
    p_value = test$p.value
  )
}) |> bind_rows()

long_tidy <- long |>
  group_by(keyword_group) |>
  mutate(
    z = as.numeric(scale(count)),
    log1p = log1p(count),
    rank = min_rank(count)
  ) |>
  ungroup()

write_csv(descriptives, "bki-r-descriptives.csv")
write_csv(as.data.frame(cor_pearson), "bki-r-correlation-pearson.csv")
write_csv(as.data.frame(cor_spearman), "bki-r-correlation-spearman.csv")
write_csv(category_models, "bki-r-category-models.csv")
write_csv(trend_models, "bki-r-trends.csv")
write_csv(anova_models, "bki-r-anova.csv")
write_csv(kruskal_models, "bki-r-kruskal.csv")
write_csv(long_tidy, "bki-r-long-tidy.csv")
`;
}

function RStatsPanel({ documents }: Props) {
  const { t } = useTranslation();
  const addLog = useProcessStore((state) => state.addLog);
  const keywordGroups = useAnalysisStore((state) => state.keywordGroups);
  const [factorDimension, setFactorDimension] = useState<FactorDimension>('category');

  const activeGroups = useMemo(
    () =>
      keywordGroups
        .map((group, index) => ({
          ...group,
          column: `kw_${index + 1}_${sanitizeColumnName(group.name)}`,
          terms: group.terms.map((term) => term.trim()).filter(Boolean),
        }))
        .filter((group) => group.terms.length),
    [keywordGroups],
  );

  const documentFrame = useMemo<DocumentFrameRow[]>(
    () => {
      const baseRows = documents.map((document) => {
        const words = wordCount(document.content);
        const row: DocumentFrameRow = {
          document_id: document.id,
          document: document.filename,
          category: document.metadata.category || 'unknown',
          author: document.metadata.author || 'unknown',
          language: document.metadata.language || 'unknown',
          tags: document.metadata.tags.join('; '),
          date: document.metadata.date ?? '',
          characters: document.content.length,
          words,
        };
        activeGroups.forEach((group) => {
          const count = countTerms(document.content, group.terms);
          row[`${group.column}_count`] = count;
          row[`${group.column}_per_1000_words`] = words ? (count / words) * 1000 : 0;
          row[`${group.column}_present`] = count > 0 ? 1 : 0;
          row[`${group.column}_log1p`] = Math.log1p(count);
        });
        return row;
      });

      activeGroups.forEach((group) => {
        const counts = baseRows.map((row) => Number(row[`${group.column}_count`] ?? 0));
        const average = mean(counts);
        const sd = standardDeviation(counts);
        const ranked = ranks(counts);
        baseRows.forEach((row, index) => {
          const count = Number(row[`${group.column}_count`] ?? 0);
          row[`${group.column}_z`] = sd ? (count - average) / sd : 0;
          row[`${group.column}_rank`] = ranked[index] ?? 0;
        });
      });

      return baseRows;
    },
    [activeGroups, documents],
  );

  const descriptiveRows = useMemo<DescriptiveRow[]>(
    () =>
      activeGroups.map((group) => {
        const counts = documentFrame.map((row) => Number(row[`${group.column}_count`] ?? 0));
        const totalWords = documentFrame.reduce((sum, row) => sum + Number(row.words ?? 0), 0);
        const total = counts.reduce((sum, count) => sum + count, 0);
        return {
          group: group.name,
          documents: counts.length,
          total,
          mean: mean(counts),
          median: median(counts),
          sd: standardDeviation(counts),
          min: counts.length ? Math.min(...counts) : 0,
          max: counts.length ? Math.max(...counts) : 0,
          hitDocuments: counts.filter((count) => count > 0).length,
          perThousandWords: totalWords ? (total / totalWords) * 1000 : 0,
        };
      }),
    [activeGroups, documentFrame],
  );

  const correlationRows = useMemo<CorrelationRow[]>(() => {
    const rows: CorrelationRow[] = [];
    activeGroups.forEach((left, leftIndex) => {
      activeGroups.slice(leftIndex + 1).forEach((right) => {
        const leftCounts = documentFrame.map((row) => Number(row[`${left.column}_count`] ?? 0));
        const rightCounts = documentFrame.map((row) => Number(row[`${right.column}_count`] ?? 0));
        rows.push({
          left: left.name,
          right: right.name,
          pearson: pearson(leftCounts, rightCounts),
          spearman: spearman(leftCounts, rightCounts),
          n: documentFrame.length,
        });
      });
    });
    return rows.sort((left, right) => Math.abs(right.pearson) - Math.abs(left.pearson));
  }, [activeGroups, documentFrame]);

  const categoryEffectRows = useMemo<CategoryEffectRow[]>(() => {
    const rows: CategoryEffectRow[] = [];
    activeGroups.forEach((group) => {
      const observations = documents.flatMap((document) =>
        factorValues(document, factorDimension).map((level) => ({
          level,
          count: Number(documentFrame.find((row) => row.document_id === document.id)?.[`${group.column}_count`] ?? 0),
        })),
      );
      const levels = [...new Set(observations.map((item) => item.level))].sort();
      const allCounts = observations.map((item) => item.count);
      const grandMean = mean(allCounts);
      const totalSs = allCounts.reduce((sum, count) => sum + (count - grandMean) ** 2, 0);
      let betweenSs = 0;
      levels.forEach((level) => {
        const levelCounts = observations.filter((item) => item.level === level).map((item) => item.count);
        betweenSs += levelCounts.length * (mean(levelCounts) - grandMean) ** 2;
      });
      const etaSquared = totalSs ? betweenSs / totalSs : 0;
      const yesByLevel = levels.map((level) => observations.filter((item) => item.level === level && item.count > 0).length);
      const noByLevel = levels.map((level, index) => observations.filter((item) => item.level === level).length - yesByLevel[index]);
      const totalYes = yesByLevel.reduce((sum, value) => sum + value, 0);
      const totalNo = noByLevel.reduce((sum, value) => sum + value, 0);
      const n = totalYes + totalNo;
      let chiSquare = 0;
      levels.forEach((_level, index) => {
        const rowTotal = yesByLevel[index] + noByLevel[index];
        const expectedYes = n ? (rowTotal * totalYes) / n : 0;
        const expectedNo = n ? (rowTotal * totalNo) / n : 0;
        if (expectedYes) chiSquare += (yesByLevel[index] - expectedYes) ** 2 / expectedYes;
        if (expectedNo) chiSquare += (noByLevel[index] - expectedNo) ** 2 / expectedNo;
      });
      const df = Math.max(0, levels.length - 1);
      const pValue = chiSquarePValue(chiSquare, df);
      const cramersV = n && df ? Math.sqrt(chiSquare / (n * Math.min(df, 1))) : 0;

      levels.forEach((level, index) => {
        const levelCounts = observations.filter((item) => item.level === level).map((item) => item.count);
        rows.push({
          group: group.name,
          factor: factorDimension,
          level,
          documents: levelCounts.length,
          total: levelCounts.reduce((sum, count) => sum + count, 0),
          mean: mean(levelCounts),
          presence: levelCounts.length ? yesByLevel[index] / levelCounts.length : 0,
          chiSquare,
          df,
          pValue,
          cramersV,
          etaSquared,
        });
      });
    });
    return rows.sort((left, right) => right.etaSquared - left.etaSquared || right.mean - left.mean);
  }, [activeGroups, documentFrame, documents, factorDimension]);

  const modelRows = useMemo<ModelRow[]>(() => {
    const rows: ModelRow[] = [];
    activeGroups.forEach((group) => {
      const observations = documents.flatMap((document) =>
        factorValues(document, factorDimension).map((level) => ({
          level,
          count: Number(documentFrame.find((row) => row.document_id === document.id)?.[`${group.column}_count`] ?? 0),
        })),
      );
      const levels = [...new Set(observations.map((item) => item.level))].sort();
      const allCounts = observations.map((item) => item.count);
      const n = allCounts.length;
      const grandMean = mean(allCounts);
      const totalSs = allCounts.reduce((sum, value) => sum + (value - grandMean) ** 2, 0);
      let betweenSs = 0;
      let withinSs = 0;
      levels.forEach((level) => {
        const levelCounts = observations.filter((item) => item.level === level).map((item) => item.count);
        const levelMean = mean(levelCounts);
        betweenSs += levelCounts.length * (levelMean - grandMean) ** 2;
        withinSs += levelCounts.reduce((sum, value) => sum + (value - levelMean) ** 2, 0);
      });
      const dfBetween = Math.max(0, levels.length - 1);
      const dfWithin = Math.max(0, n - levels.length);
      const msBetween = dfBetween ? betweenSs / dfBetween : 0;
      const msWithin = dfWithin ? withinSs / dfWithin : 0;
      const fStatistic = msWithin ? msBetween / msWithin : msBetween ? Number.MAX_VALUE : 0;
      const pValue = fPValue(fStatistic, dfBetween, dfWithin);
      const etaSquared = totalSs ? betweenSs / totalSs : 0;
      const omegaSquared = totalSs + msWithin ? Math.max(0, (betweenSs - dfBetween * msWithin) / (totalSs + msWithin)) : 0;

      const rankedCounts = ranks(allCounts);
      let rankCursor = 0;
      const rankByLevel = new Map<string, number[]>();
      observations.forEach((observation) => {
        rankByLevel.set(observation.level, [...(rankByLevel.get(observation.level) ?? []), rankedCounts[rankCursor]]);
        rankCursor += 1;
      });
      let kruskalH = 0;
      rankByLevel.forEach((rankValues) => {
        const rankTotal = rankValues.reduce((sum, value) => sum + value, 0);
        kruskalH += rankTotal ** 2 / rankValues.length;
      });
      kruskalH = n ? (12 / (n * (n + 1))) * kruskalH - 3 * (n + 1) : 0;
      const kruskalPValue = chiSquarePValue(kruskalH, dfBetween);
      const epsilonSquared = n > levels.length ? Math.max(0, (kruskalH - levels.length + 1) / (n - levels.length)) : 0;

      rows.push({
        group: group.name,
        factor: factorDimension,
        n,
        levels: levels.length,
        fStatistic,
        dfBetween,
        dfWithin,
        fPValue: pValue,
        etaSquared,
        omegaSquared,
        kruskalH,
        kruskalPValue,
        epsilonSquared,
      });
    });
    return rows.sort((left, right) => left.fPValue - right.fPValue || right.etaSquared - left.etaSquared);
  }, [activeGroups, documentFrame, documents, factorDimension]);

  const trendRows = useMemo<TrendRow[]>(() => {
    const sortedFrame = [...documentFrame].sort((left, right) => {
      const leftDate = left.date ? Date.parse(String(left.date)) : Number.NaN;
      const rightDate = right.date ? Date.parse(String(right.date)) : Number.NaN;
      if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) return leftDate - rightDate;
      return String(left.document).localeCompare(String(right.document));
    });
    const xByDate = sortedFrame.map((row, index) => {
      const parsed = row.date ? Date.parse(String(row.date)) : Number.NaN;
      return Number.isFinite(parsed) ? parsed / 86_400_000 : index + 1;
    });
    const hasVaryingX = new Set(xByDate.map((value) => String(value))).size > 1;
    const xs = hasVaryingX ? xByDate : sortedFrame.map((_row, index) => index + 1);
    return activeGroups.map((group) => {
      const ys = sortedFrame.map((row) => Number(row[`${group.column}_count`] ?? 0));
      const model = linearRegression(xs, ys);
      return {
        group: group.name,
        n: ys.length,
        slope: model.slope,
        intercept: model.intercept,
        rSquared: model.rSquared,
        firstValue: ys[0] ?? 0,
        lastValue: ys.at(-1) ?? 0,
      };
    }).sort((left, right) => right.rSquared - left.rSquared);
  }, [activeGroups, documentFrame]);

  const strongestCorrelation = correlationRows[0];
  const strongestEffect = categoryEffectRows[0];
  const strongestTrend = trendRows[0];
  const strongestModel = modelRows[0];
  const hasData = documentFrame.length > 0 && activeGroups.length > 0;

  const tidyRows = () =>
    documentFrame.flatMap((row) =>
      activeGroups.map((group) => ({
        document_id: row.document_id,
        document: row.document,
        category: row.category,
        author: row.author,
        language: row.language,
        tags: row.tags,
        date: row.date,
        keyword_group: group.name,
        variable: `${group.column}_count`,
        count: row[`${group.column}_count`],
        per_1000_words: row[`${group.column}_per_1000_words`],
        present: row[`${group.column}_present`],
        z: row[`${group.column}_z`],
        log1p: row[`${group.column}_log1p`],
        rank: row[`${group.column}_rank`],
      })),
    );

  const statsRows = () => [
    ...descriptiveRows.map((row) => ({
      section: 'descriptive',
      group: row.group,
      documents: row.documents,
      total: row.total,
      mean: row.mean,
      median: row.median,
      sd: row.sd,
      min: row.min,
      max: row.max,
      hit_documents: row.hitDocuments,
      per_1000_words: row.perThousandWords,
    })),
    ...correlationRows.map((row) => ({
      section: 'correlation',
      left: row.left,
      right: row.right,
      pearson: row.pearson,
      spearman: row.spearman,
      n: row.n,
    })),
    ...categoryEffectRows.map((row) => ({
      section: 'category_effect',
      factor: row.factor,
      level: row.level,
      group: row.group,
      documents: row.documents,
      total: row.total,
      mean: row.mean,
      presence: row.presence,
      chi_square: row.chiSquare,
      df: row.df,
      p_value: row.pValue,
      cramers_v: row.cramersV,
      eta_squared: row.etaSquared,
    })),
    ...modelRows.map((row) => ({
      section: 'factor_model',
      group: row.group,
      factor: row.factor,
      n: row.n,
      levels: row.levels,
      f_statistic: row.fStatistic,
      df_between: row.dfBetween,
      df_within: row.dfWithin,
      f_p_value: row.fPValue,
      eta_squared: row.etaSquared,
      omega_squared: row.omegaSquared,
      kruskal_h: row.kruskalH,
      kruskal_p_value: row.kruskalPValue,
      epsilon_squared: row.epsilonSquared,
    })),
    ...trendRows.map((row) => ({
      section: 'trend',
      group: row.group,
      n: row.n,
      slope: row.slope,
      intercept: row.intercept,
      r_squared: row.rSquared,
      first_value: row.firstValue,
      last_value: row.lastValue,
    })),
  ];

  const exportDataFrame = () => {
    if (!documentFrame.length) return;
    downloadText('bki-r-document-frame.csv', toCsv(documentFrame), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'analysis.r_stats',
      title: 'R document frame exported',
      detail: `${documentFrame.length} document row(s) were exported.`,
      data: { documentCount: documentFrame.length, groupCount: activeGroups.length },
    });
  };

  const exportStats = () => {
    const rows = statsRows();
    if (!rows.length) return;
    downloadText('bki-r-statistics.csv', toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'analysis.r_stats',
      title: 'R-style statistics exported',
      detail: `${rows.length} statistic row(s) were exported.`,
      data: { rowCount: rows.length, factorDimension },
    });
  };

  const exportTidyFrame = () => {
    const rows = tidyRows();
    if (!rows.length) return;
    downloadText('bki-r-long-tidy.csv', toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'analysis.r_stats',
      title: 'R tidy long frame exported',
      detail: `${rows.length} tidy row(s) were exported.`,
      data: { rowCount: rows.length, factorDimension },
    });
  };

  const exportRScript = () => {
    if (!activeGroups.length) return;
    const columns = activeGroups.map((group) => `${group.column}_count`);
    downloadText('bki-r-analysis.R', makeRScript(columns, factorDimension), 'text/x-rsrc;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'analysis.r_stats',
      title: 'R analysis script exported',
      detail: 'Generated an R script for reproducible downstream analysis.',
      data: { columnCount: columns.length, factorDimension },
    });
  };

  return (
    <section className="panel span-all">
      <div className="panel-header">
        <h2 className="section-title">{t('quant.rStats')}</h2>
        <div className="toolbar">
          <button className="ghost-button" type="button" disabled={!hasData} onClick={exportDataFrame}>
            <Download size={17} />
            {t('quant.exportRFrame')}
          </button>
          <button className="ghost-button" type="button" disabled={!hasData} onClick={exportStats}>
            <Download size={17} />
            {t('quant.exportRStats')}
          </button>
          <button className="ghost-button" type="button" disabled={!hasData} onClick={exportTidyFrame}>
            <Download size={17} />
            {t('quant.exportTidyFrame')}
          </button>
          <button className="ghost-button" type="button" disabled={!activeGroups.length} onClick={exportRScript}>
            <Download size={17} />
            {t('quant.exportRScript')}
          </button>
        </div>
      </div>
      <div className="panel-body">
        {!hasData ? (
          <div className="empty-state">{t('quant.noRStatsData')}</div>
        ) : (
          <>
            <div className="insight-grid">
              <div className="insight-tile">
                <span>{t('quant.rFrameRows')}</span>
                <strong>{documentFrame.length}</strong>
              </div>
              <div className="insight-tile">
                <span>{t('quant.rVariables')}</span>
                <strong>{activeGroups.length}</strong>
              </div>
              <div className="insight-tile">
                <span>{t('quant.strongestCorrelation')}</span>
                <strong>{strongestCorrelation ? formatNumber(strongestCorrelation.pearson, 2) : 'n/a'}</strong>
              </div>
              <div className="insight-tile">
                <span>{t('quant.strongestCategoryEffect')}</span>
                <strong>{strongestEffect ? formatNumber(strongestEffect.etaSquared, 2) : 'n/a'}</strong>
              </div>
              <div className="insight-tile">
                <span>{t('quant.strongestModel')}</span>
                <strong>{strongestModel ? formatNumber(strongestModel.fPValue, 3) : 'n/a'}</strong>
              </div>
              <div className="insight-tile">
                <span>{t('quant.strongestTrend')}</span>
                <strong>{strongestTrend ? formatNumber(strongestTrend.rSquared, 2) : 'n/a'}</strong>
              </div>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>{t('quant.factorDimension')}</span>
                <select className="select-input" value={factorDimension} onChange={(event) => setFactorDimension(event.target.value as FactorDimension)}>
                  {factorDimensions.map((dimension) => (
                    <option key={dimension} value={dimension}>
                      {t(`quant.factor_${dimension}`)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>{t('quant.rFormula')}</span>
                <div className="selection-preview">
                  <strong>{t('quant.rFormulaValue')}</strong>
                  <p>{t('quant.rFormulaHint')}</p>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>{t('quant.factorModels')}</th>
                    <th>{t('quant.factorDimension')}</th>
                    <th>{t('quant.levels')}</th>
                    <th>F</th>
                    <th>p</th>
                    <th>η²</th>
                    <th>ω²</th>
                    <th>H</th>
                    <th>{t('quant.kruskalP')}</th>
                    <th>ε²</th>
                  </tr>
                </thead>
                <tbody>
                  {modelRows.map((row) => (
                    <tr key={`${row.group}-${row.factor}`}>
                      <td>{row.group}</td>
                      <td>{t(`quant.factor_${row.factor}`)}</td>
                      <td>{row.levels}</td>
                      <td>{formatNumber(row.fStatistic)}</td>
                      <td>{formatNumber(row.fPValue, 4)}</td>
                      <td>{formatNumber(row.etaSquared)}</td>
                      <td>{formatNumber(row.omegaSquared)}</td>
                      <td>{formatNumber(row.kruskalH)}</td>
                      <td>{formatNumber(row.kruskalPValue, 4)}</td>
                      <td>{formatNumber(row.epsilonSquared)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>{t('quant.groupName')}</th>
                    <th>{t('quant.total')}</th>
                    <th>{t('quant.mean')}</th>
                    <th>{t('quant.median')}</th>
                    <th>{t('quant.sd')}</th>
                    <th>{t('quant.min')}</th>
                    <th>{t('quant.max')}</th>
                    <th>{t('quant.hitDocuments')}</th>
                    <th>{t('quant.perThousandWords')}</th>
                  </tr>
                </thead>
                <tbody>
                  {descriptiveRows.map((row) => (
                    <tr key={row.group}>
                      <td>{row.group}</td>
                      <td>{row.total}</td>
                      <td>{formatNumber(row.mean)}</td>
                      <td>{formatNumber(row.median)}</td>
                      <td>{formatNumber(row.sd)}</td>
                      <td>{row.min}</td>
                      <td>{row.max}</td>
                      <td>{row.hitDocuments}/{row.documents}</td>
                      <td>{formatNumber(row.perThousandWords)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>{t('quant.correlation')}</th>
                    <th>{t('quant.pearson')}</th>
                    <th>{t('quant.spearman')}</th>
                    <th>n</th>
                  </tr>
                </thead>
                <tbody>
                  {correlationRows.length === 0 ? (
                    <tr>
                      <td colSpan={4}>{t('quant.noCorrelation')}</td>
                    </tr>
                  ) : (
                    correlationRows.slice(0, 40).map((row) => (
                      <tr key={`${row.left}-${row.right}`}>
                        <td>{row.left} × {row.right}</td>
                        <td>{formatNumber(row.pearson)}</td>
                        <td>{formatNumber(row.spearman)}</td>
                        <td>{row.n}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>{t('quant.categoryEffects')}</th>
                    <th>{t('quant.level')}</th>
                    <th>{t('quant.documents')}</th>
                    <th>{t('quant.mean')}</th>
                    <th>{t('quant.presence')}</th>
                    <th>χ²</th>
                    <th>p</th>
                    <th>Cramer's V</th>
                    <th>η²</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryEffectRows.slice(0, 60).map((row) => (
                    <tr key={`${row.group}-${row.level}`}>
                      <td>{row.group}</td>
                      <td>{row.level}</td>
                      <td>{row.documents}</td>
                      <td>{formatNumber(row.mean)}</td>
                      <td>{formatNumber(row.presence, 2)}</td>
                      <td>{formatNumber(row.chiSquare)}</td>
                      <td>{formatNumber(row.pValue, 4)}</td>
                      <td>{formatNumber(row.cramersV)}</td>
                      <td>{formatNumber(row.etaSquared)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>{t('quant.linearTrend')}</th>
                    <th>{t('quant.slope')}</th>
                    <th>{t('quant.intercept')}</th>
                    <th>R²</th>
                    <th>{t('quant.firstValue')}</th>
                    <th>{t('quant.lastValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.map((row) => (
                    <tr key={row.group}>
                      <td>{row.group}</td>
                      <td>{formatNumber(row.slope)}</td>
                      <td>{formatNumber(row.intercept)}</td>
                      <td>{formatNumber(row.rSquared)}</td>
                      <td>{row.firstValue}</td>
                      <td>{row.lastValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default RStatsPanel;

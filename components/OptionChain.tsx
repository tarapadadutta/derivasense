"use client";

import { MarketData } from "../lib/marketTypes";

function fmt(
  value: unknown,
  decimals = 2
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toLocaleString(
    "en-IN",
    {
      minimumFractionDigits:
        decimals,
      maximumFractionDigits:
        decimals,
    }
  );
}

function fmtInt(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toLocaleString("en-IN");
}

function sign(value: unknown) {
  const n = Number(value);

  return n > 0 ? "+" : "";
}

export default function OptionChain({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: string;
}) {

  const indexData =
    data.indices.find(
      (x) =>
        x.symbol === symbol ||
        x.symbol ===
          (symbol === "NIFTY"
            ? "NIFTY 50"
            : symbol === "BANKNIFTY"
            ? "BANK NIFTY"
            : symbol === "FINNIFTY"
            ? "FIN NIFTY"
            : "SENSEX")
    );

  const spot =
    Number(indexData?.spot ?? 0);

  const atm =
    Number(indexData?.atm ?? 0);

  const source =
    data.optionChain?.[symbol] ?? [];

  let rows = [...source];

  rows.sort(
    (a, b) =>
      Number(a[6]) -
      Number(b[6])
  );

  let atmIndex = rows.findIndex(
    (row) =>
      Number(row[6]) === atm
  );

  if (
    atmIndex < 0 &&
    rows.length &&
    atm
  ) {
    let closest = Infinity;

    rows.forEach(
      (row, index) => {
        const distance =
          Math.abs(
            Number(row[6]) - atm
          );

        if (
          distance <
          Math.abs(
            Number(
              rows[closest]?.[6] ??
                Infinity
            ) - atm
          )
        ) {
          closest = index;
        }
      }
    );

    atmIndex = closest;
  }

  if (
    atmIndex >= 0 &&
    rows.length
  ) {
    const start =
      Math.max(
        0,
        atmIndex - 5
      );

    const end =
      Math.min(
        rows.length,
        atmIndex + 6
      );

    rows = rows.slice(
      start,
      end
    );
  }

  return (
    <div className="card">

      <div className="row">

        <div>
          <h3>
            {symbol} OPTION CHAIN
          </h3>

          <div className="sub">
            ATM ± 5 ·{" "}
            {rows.length} strikes ·
            Spot {fmt(spot)} ·
            ATM {fmtInt(atm)}
          </div>
        </div>

        <div className="mono">
          PCR OI{" "}
          {fmt(indexData?.pcrOI)}
          {" · "}
          PCR COI{" "}
          {fmt(indexData?.pcrCOI)}
        </div>

      </div>

      <div
        className="chainwrap"
        style={{
          marginTop: 12,
        }}
      >

        {!rows.length ? (

          <div className="chart-empty">
            No live option-chain
            data available for{" "}
            {symbol}.
          </div>

        ) : (

          <table>

            <thead>

              <tr>

                <th
                  colSpan={6}
                  className="callhead"
                  style={{
                    textAlign:
                      "center",
                  }}
                >
                  CALL
                </th>

                <th
                  className="strike"
                >
                  STRIKE
                </th>

                <th
                  colSpan={6}
                  className="puthead"
                  style={{
                    textAlign:
                      "center",
                  }}
                >
                  PUT
                </th>

              </tr>

              <tr>

                <th>OI</th>
                <th>COI</th>
                <th>VOLUME</th>
                <th>IV</th>
                <th>LTP</th>
                <th>CHG</th>

                <th>STRIKE</th>

                <th>CHG</th>
                <th>LTP</th>
                <th>IV</th>
                <th>VOLUME</th>
                <th>COI</th>
                <th>OI</th>

              </tr>

            </thead>

            <tbody>

              {rows.map(
                (r, index) => {

                  const strike =
                    Number(r[6]);

                  const isATM =
                    Boolean(atm) &&
                    strike === atm;

                  return (
                    <tr
                      key={`${strike}-${index}`}
                      className={
                        isATM
                          ? "atm"
                          : ""
                      }
                    >

                      <td>
                        {fmtInt(r[0])}
                      </td>

                      <td
                        className={
                          Number(r[1]) >= 0
                            ? "up"
                            : "down"
                        }
                      >
                        {sign(r[1])}
                        {fmtInt(r[1])}
                      </td>

                      <td>
                        {fmtInt(r[2])}
                      </td>

                      <td>
                        {fmt(r[3])}
                      </td>

                      <td>
                        {fmt(r[4])}
                      </td>

                      <td
                        className={
                          Number(r[5]) >= 0
                            ? "up"
                            : "down"
                        }
                      >
                        {sign(r[5])}
                        {fmt(r[5])}
                      </td>

                      <td className="strike">

                        {fmtInt(strike)}

                        {isATM && (
                          <span
                            style={{
                              color:
                                "var(--accent)",
                            }}
                          >
                            {" · ATM"}
                          </span>
                        )}

                      </td>

                      <td
                        className={
                          Number(r[7]) >= 0
                            ? "up"
                            : "down"
                        }
                      >
                        {sign(r[7])}
                        {fmt(r[7])}
                      </td>

                      <td>
                        {fmt(r[8])}
                      </td>

                      <td>
                        {fmt(r[9])}
                      </td>

                      <td>
                        {fmtInt(r[10])}
                      </td>

                      <td
                        className={
                          Number(r[11]) >= 0
                            ? "up"
                            : "down"
                        }
                      >
                        {sign(r[11])}
                        {fmtInt(r[11])}
                      </td>

                      <td>
                        {fmtInt(r[12])}
                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        )}

      </div>

      <div
        className="sub"
        style={{
          marginTop: 8,
        }}
      >
        Showing {rows.length} strikes ·
        ATM {fmtInt(atm)} ·
        Spot {fmt(spot)} · {symbol}
      </div>

    </div>
  );
}
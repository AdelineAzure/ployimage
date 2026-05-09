import { COUNT_OPTIONS } from "../../config/appConfig";
import { S } from "../../styles/appStyles";

export function ModelChip({ model, selected, onToggle, disabled, count, onCountChange, styleMode = false }) {
  const displayName = model.shortName || model.name;
  return (
    <div style={{ ...S.modelChipWrap, opacity: disabled && !selected ? 0.35 : 1 }}>
      <div style={S.modelRow}>
        <button
          onClick={() => onToggle(model.id)}
          disabled={disabled && !selected}
          style={{
            ...S.modelChip,
            background: selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
            borderColor: selected ? "#facc15" : "rgba(255,255,255,0.08)",
            cursor: disabled && !selected ? "not-allowed" : "pointer",
          }}
        >
          <span style={styleMode ? S.chipNameStyleMode : S.chipName} title={model.name}>{displayName}</span>
          {selected && <span style={S.check}>✓</span>}
        </button>
        <label style={S.countRow}>
          <span style={S.countLabel}>x</span>
          <select
            value={count}
            onChange={(e) => onCountChange(model.id, e.target.value)}
            style={S.countSelect}
            disabled={!selected}
          >
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

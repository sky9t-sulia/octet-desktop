import { CaretGlyph } from "../design/Glyphs";
import { Segments, ToggleRow } from "../design/ToggleRow";
import { CAPS, CAPS_BARE, cx, t } from "../design/type";
import type { Vals } from "../state/useShell";

/**
 * Settings, as its own window over everything else: GENERAL, VIDEO, AUDIO,
 * CONTROLS, PATHS and SHORTCUTS down the left, one pane at a time on the
 * right.
 */
export function SettingsWindow({ v }: { v: Vals }) {
  if (!v.settingsOpen) return null;

  return (
    <div className="absolute inset-0 z-[6] flex items-center justify-center bg-scrim-soft">
      <div className="flex h-[640px] w-[940px] flex-col border-[3px] border-ink bg-paper shadow-modal-soft">
        <div className="flex h-[54px] flex-none items-center gap-[14px] bg-ink pr-[8px] pl-[20px]">
          <h2 className={cx(t.pixel12, "text-paper")}>SETTINGS</h2>
          <span className={cx(t.screen12, "text-dim")}>OCTET / V1.4.2</span>
          <div className="flex-1" />
          <button
            onClick={v.closeSettings}
            aria-label="Close settings"
            className={cx(
              "flex h-[38px] w-[38px] cursor-pointer items-center justify-center text-dim hover:text-on-accent",
              t.pixel11,
            )}
          >
            X
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Categories */}
          <nav className="flex w-[208px] flex-none flex-col gap-[4px] border-r-2 border-ink bg-panel px-[12px] py-[14px]">
            {v.cats.map((cat) => (
              <button
                key={cat.key}
                onClick={cat.pick}
                className={cx(
                  "flex h-[42px] cursor-pointer items-center gap-[10px] px-[12px] hover:bg-hover-panel",
                  cat.face,
                )}
              >
                <div className={cx("h-[8px] w-[8px] flex-none", cat.dot)} />
                <span className={cx(t.pixel10, "text-ink")}>{cat.label}</span>
              </button>
            ))}
          </nav>

          {/* The pane for whichever category is up */}
          <div className="flex min-w-0 flex-1 flex-col gap-[26px] overflow-y-auto px-[26px] pt-[24px] pb-[30px]">
            {v.cat === 0 && <General v={v} />}
            {v.cat === 1 && <Video v={v} />}
            {v.cat === 2 && <Audio v={v} />}
            {v.cat === 3 && <Controls v={v} />}
            {v.cat === 4 && <Paths v={v} />}
            {v.cat === 5 && <Shortcuts v={v} />}
          </div>
        </div>

        <div className="flex h-[64px] flex-none items-center gap-[12px] border-t-2 border-ink bg-panel px-[22px]">
          <span className={cx(t.screen11, "text-dim")}>{v.setStatus}</span>
          <div className="flex-1" />
          <button
            onClick={v.closeSettings}
            className={cx(
              "flex h-[40px] cursor-pointer items-center border-2 border-ink bg-paper px-[20px] text-ink shadow-press hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-press-in",
              t.pixel9,
            )}
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}

/** Language, theme, and the two housekeeping toggles. */
function General({ v }: { v: Vals }) {
  return (
    <>
      <section className="flex flex-col gap-[12px]">
        <h3 className={CAPS}>LANGUAGE</h3>
        {/* The field and the list it drops are one control: no gap between. */}
        <div className="flex flex-col">
          <button
            onClick={v.toggleLang}
            aria-expanded={v.langOpen}
            // No width of its own: a flex column stretches its children, and
            // content-box sizing then takes the padding and border out of the
            // inside rather than pushing past the pane.
            className="flex h-[46px] cursor-pointer items-center gap-[12px] border-2 border-ink bg-panel px-[12px]"
          >
            <div
              className={cx(
                "flex h-[26px] w-[32px] flex-none items-center justify-center border-2 border-ink text-ink",
                t.pixel9,
              )}
            >
              {v.langCode}
            </div>
            <div className={cx("min-w-0 flex-1 text-left text-ink", t.pixel10)}>
              {v.langName}
            </div>
            <CaretGlyph flip={v.caretFlip} />
          </button>

          {v.langOpen && (
            // Pulled up two pixels so its top keyline lands on the field's
            // bottom one, leaving a single rule rather than a doubled 4px bar.
            <div className="-mt-[2px] flex flex-col border-2 border-ink bg-card">
              {v.langs.map((lang) => (
                <button
                  key={lang.key}
                  onClick={lang.pick}
                  className={cx(
                    "flex h-[42px] cursor-pointer items-center gap-[12px] border-b-2 border-rule-soft px-[12px] last:border-b-0 hover:bg-hover-face",
                    lang.face,
                  )}
                >
                  <div
                    className={cx(
                      "w-[26px] flex-none text-left text-dim",
                      t.screen10,
                    )}
                  >
                    {lang.code}
                  </div>
                  <div
                    className={cx(
                      "min-w-0 flex-1 text-left text-ink",
                      t.pixel10,
                    )}
                  >
                    {lang.name}
                  </div>
                  <div className={cx(t.pixel9, "text-accent")}>{lang.tick}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-[12px]">
        <h3 className={CAPS}>THEME</h3>
        <Segments items={v.themes} />
      </section>

      <section className="flex flex-col gap-[8px]">
        {v.genToggles.map((tg) => (
          <ToggleRow key={tg.key} tg={tg} />
        ))}
      </section>
    </>
  );
}

/** Scaling and filter, with a live preview of both, then the picture toggles. */
function Video({ v }: { v: Vals }) {
  return (
    <>
      <div className="flex gap-[26px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
          <section className="flex flex-col gap-[12px]">
            <h3 className={CAPS}>SCALING</h3>
            <Segments items={v.scales} size={t.pixel8} />
          </section>
          <section className="flex flex-col gap-[12px]">
            <h3 className={CAPS}>FILTER</h3>
            <Segments items={v.filters} size={t.pixel8} />
          </section>
        </div>

        <section className="flex w-[300px] flex-none flex-col gap-[12px]">
          <h3 className={CAPS}>PREVIEW</h3>
          <div
            className={cx(
              "flex h-[172px] items-center justify-center border-2 border-ink bg-void",
              v.previewPad,
            )}
          >
            <div
              className={cx(
                "relative flex h-full flex-1 items-center justify-center",
                v.previewTint,
                v.previewFilter,
              )}
            >
              <span className={cx("relative z-[2] text-on-accent", t.pixel10)}>
                {v.previewLabel}
              </span>
              <div
                className={cx(
                  "absolute inset-0 scanlines-preview",
                  v.scanOpacity,
                )}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-[8px]">
        {v.vidToggles.map((tg) => (
          <ToggleRow key={tg.key} tg={tg} />
        ))}
      </section>
    </>
  );
}

/** Volume as ten blocks, then the two sound toggles. */
function Audio({ v }: { v: Vals }) {
  return (
    <>
      <section className="flex w-[460px] flex-col gap-[12px]">
        <div className="flex items-baseline justify-between">
          <h3 className={CAPS}>VOLUME</h3>
          <span className={cx(t.screen11, "text-mute")}>{v.volReadout}</span>
        </div>
        <div className="flex h-[34px] items-stretch gap-[3px]">
          {v.volBlocks.map((blk) => (
            <button
              key={blk.key}
              onClick={blk.set}
              aria-label={`Volume ${(blk.key + 1) * 10}%`}
              className={cx(
                "flex-1 cursor-pointer border-2 border-ink",
                blk.face,
              )}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-[8px]">
        {v.audToggles.map((tg) => (
          <ToggleRow key={tg.key} tg={tg} />
        ))}
      </section>
    </>
  );
}

/** Which folders are scanned, where saves and shots go, and the two path toggles. */
function Paths({ v }: { v: Vals }) {
  return (
    <>
      <section className="flex flex-col gap-[12px]">
        <div className="flex items-baseline justify-between">
          <h3 className={CAPS}>ROM FOLDERS</h3>
          <span className={cx(t.screen11, "text-dim")}>{v.romFolderCount}</span>
        </div>
        <div className="flex flex-col gap-[8px]">
          {v.romFolders.map((rf) => (
            <div
              key={rf.key}
              className={cx(
                "flex h-[52px] items-center gap-[12px] border-2 px-[12px]",
                rf.row,
              )}
            >
              <button
                onClick={rf.toggle}
                role="checkbox"
                aria-checked={rf.tick === "X"}
                className={cx(
                  "flex h-[20px] w-[20px] flex-none cursor-pointer items-center justify-center border-2 border-ink",
                  rf.box,
                )}
              >
                <span className={cx(t.pixel8, "text-on-accent")}>
                  {rf.tick}
                </span>
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
                <div className={cx("truncate text-ink", t.screen10)}>
                  {rf.dir}
                </div>
                <div className={cx(t.screen11, "text-dim")}>{rf.detail}</div>
              </div>
              <button
                onClick={rf.remove}
                aria-label={`Remove ${rf.dir}`}
                className={cx(
                  "flex h-[34px] w-[34px] flex-none cursor-pointer items-center justify-center border-2 border-rule text-mute hover:border-ink hover:bg-accent hover:text-on-accent",
                  t.pixel9,
                )}
              >
                X
              </button>
            </div>
          ))}
          <button
            onClick={v.addFolder}
            className="flex h-[46px] cursor-pointer items-center justify-center gap-[9px] border-2 border-dashed border-rule-mid bg-transparent hover:border-ink hover:bg-card"
          >
            <span className={cx(t.pixel11, "text-mute")}>+</span>
            <span className={cx(t.pixel9, "text-mute")}>{v.say("add_folder")}</span>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-[12px]">
        <h3 className={CAPS}>DIRECTORIES</h3>
        <div className="flex flex-col gap-[8px]">
          {v.paths.map((p) => (
            <div
              key={p.label}
              className="flex h-[52px] items-center gap-[12px] border-2 border-rule bg-card px-[12px]"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
                <div className={cx(t.pixel9, "text-ink")}>{p.label}</div>
                <div className={cx("truncate text-mute", t.screen11)}>
                  {p.dir}
                </div>
              </div>
              <button
                onClick={v.noop}
                className={cx(
                  "flex h-[34px] flex-none cursor-pointer items-center border-2 border-ink bg-paper px-[12px] text-ink hover:bg-hover-face",
                  t.pixel8,
                )}
              >
                BROWSE
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-[8px]">
        {v.pathToggles.map((tg) => (
          <ToggleRow key={tg.key} tg={tg} />
        ))}
      </section>
    </>
  );
}

/** One console button, and the key it answers to. Pressed to listen for another. */
function BindRow({ row }: { row: Vals["keyBinds"][number] }) {
  return (
    <button
      onClick={row.pick}
      disabled={!row.live}
      className={cx(
        "flex h-[46px] items-center gap-[12px] border-2 px-[12px]",
        row.live ? "cursor-pointer" : "cursor-default",
        row.row,
      )}
    >
      <span className={cx("min-w-0 flex-1 text-left", row.labelInk, t.pixel10)}>
        {row.label}
      </span>
      {/* Wide enough for the longest label a key has, so the column holds
          still while a row is listening. */}
      <kbd
        className={cx(
          "flex h-[26px] w-[124px] flex-none items-center justify-center border-2",
          row.cap,
          t.pixel9,
        )}
      >
        {row.bound}
      </kbd>
    </button>
  );
}

/**
 * Which key works which button, for the keyboard and for a controller.
 *
 * The keyboard is always live and all of it moves. A controller only moves
 * where there is anything to decide — its D-pad, BACK and START already say
 * what they do — and the whole section is dead without one plugged in, drawn
 * rather than hidden so it is clear the app would use one.
 */
function Controls({ v }: { v: Vals }) {
  return (
    <>
      <section className="flex flex-col gap-[12px]">
        <div className="flex items-baseline justify-between">
          <h3 className={CAPS}>KEYBOARD</h3>
          <button
            onClick={v.restoreBinds}
            disabled={v.bindsStock}
            className={cx(
              "text-dim",
              v.bindsStock ? "cursor-default opacity-40" : "cursor-pointer hover:text-ink",
              t.screen11,
            )}
          >
            RESTORE DEFAULTS
          </button>
        </div>
        <div className="flex flex-col gap-[8px]">
          {v.keyBinds.map((row) => (
            <BindRow key={row.key} row={row} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-[12px]">
        <div className="flex items-baseline justify-between">
          <h3 className={cx(CAPS_BARE, v.padHeadInk)}>GAMEPAD</h3>
          {!v.padPresent && (
            <span className={cx(t.screen11, "text-faint")}>
              NO CONTROLLER — PRESS A BUTTON ON ONE
            </span>
          )}
        </div>
        <div className="flex flex-col gap-[8px]">
          {v.padBinds.map((row) => (
            <BindRow key={row.key} row={row} />
          ))}
        </div>
      </section>
    </>
  );
}

/**
 * Every key the app answers to, in groups.
 *
 * A reference rather than a control panel — nothing here is rebindable, so
 * the rows are read-only and the keys themselves are `kbd`.
 */
function Shortcuts({ v }: { v: Vals }) {
  return (
    <>
      {v.shortcuts.map((group) => (
        <section key={group.key} className="flex flex-col gap-[12px]">
          <h3 className={CAPS}>{group.group}</h3>
          <div className="flex flex-col gap-[8px]">
            {group.rows.map((row) => (
              <div
                key={row.key}
                className="flex h-[42px] items-center gap-[12px] border-2 border-rule bg-card px-[12px]"
              >
                {/* Wide enough for CTRL+W and ARROWS / WASD alike, so every
                    description in the pane starts on the same column. */}
                <kbd
                  className={cx(
                    "flex h-[26px] w-[152px] flex-none items-center justify-center border-2 border-ink bg-panel text-ink",
                    t.pixel9,
                  )}
                >
                  {row.keys}
                </kbd>
                <span className={cx("min-w-0 flex-1 truncate text-dim", t.screen11)}>
                  {row.what}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

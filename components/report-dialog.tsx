"use client";

/**
 * **제보 창** — 어느 화면에서든 뜬다 (`docs/DESIGN.md §12-161`)
 *
 * 사장님(2026-08-23) — 「오류보고랑 수정 요청이랑 함께. **제보라는 버튼을 곳곳에 배치.**
 * 항목을 **오류수정 · 예상티오 · 인사관련문서** 이렇게 나누면 될 듯. supaclass q&a 참고하면 좋을 듯.」
 *
 * `app/layout.tsx` 에 **하나만** 달려 있다. 단추(`report-button.tsx`)는 `openReport()` 만 부르고
 * 이것을 모른다 — `login-gate` · `toast` 와 같은 방식이다. 그래서 단추를 아무 데나 놓아도 된다.
 *
 * supaclass Q&A 에서 가져온 것 셋 — ① 갈래를 먼저 고른다 ② 보낸 것과 **답장**을 같은 창에서 읽는다
 * ③ 길이를 **명시적으로 거절**한다(조용히 안 자른다). 나머지는 이 저장소 결대로 다시 짰다.
 *
 * ⛔ **손님(익명)은 못 보낸다.** 익명 열쇠는 아무나 몇 개든 만들 수 있어 도배를 못 막는다.
 *    로그인 안 한 사람에게는 로그인 모달을 대신 연다(`openLogin`).
 * ⛔ **실패를 화면이 버리지 않는다**(§11-2). 서버가 거절한 경우와 요청이 끊긴 경우를 **둘 다** 받는다.
 * ⛔ **닫는 길 셋** — ✕ · 어두운 막 · Esc. ✕ 는 44px 다(§11-4).
 * ⛔ 이모지를 안 쓴다. 아이콘은 lucide-react (§3).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileUp, Loader2, Trash2, X } from "lucide-react";
import { Portal } from "@/components/portal";
import { authClient } from "@/lib/auth/client";
import { openLogin } from "@/lib/login-gate";
import { toast } from "@/lib/toast";
import {
  BODY_MAX,
  FILE_ACCEPT,
  FILE_BYTES,
  FILE_KINDS,
  FILE_MAX,
  REPORT_EVENT,
  REPORT_KINDS,
  REPORT_LABEL,
  type ReportKind,
  type ReportSeed,
} from "@/lib/report";

/**
 * 탭 셋. **「받은 것」은 운영에게만 보인다** — `staff` 표에 줄이 있는 사람.
 * ⛔ 화면 조건으로만 가르지 않는다. DB 의 RLS(`reports_staff_select`)가 같은 것을 다시 가른다 —
 *    화면이 뚫려도 남의 제보는 안 온다.
 */
type Tab = "send" | "sent" | "inbox";

/** 올려 둔 파일 한 개. `path` 는 스토리지 안의 자리다 */
type Shot = { id: string; path: string; name: string; bytes: number };

type Mine = {
  id: string;
  created_at: string;
  kind: ReportKind;
  body: string;
  status: string;
  reply: string | null;
  replied_at: string | null;
};

/** 운영이 보는 한 줄. 보낸 사람이 붙인 파일과 어느 화면에서 눌렀는지가 함께 온다 */
type Inbox = Mine & {
  sido: string | null;
  std_code: string | null;
  page: string | null;
  report_files: { id: string; path: string; name: string; bytes: number }[] | null;
};

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

export function ReportDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("send");
  const [kind, setKind] = useState<ReportKind>("error");
  const [body, setBody] = useState("");
  const [seed, setSeed] = useState<ReportSeed>({});
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  /** 파일을 창 위로 끌어왔나 · 안쪽 자식을 지날 때마다 오는 `dragleave` 를 세어 깜빡임을 막는다 */
  const [over, setOver] = useState(false);
  const drag = useRef(0);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [mine, setMine] = useState<Mine[] | null>(null);
  /** 운영인가. null 이면 아직 모른다 — 탭을 그리기 전이다 */
  const [staff, setStaff] = useState<boolean | null>(null);
  const [inbox, setInbox] = useState<Inbox[] | null>(null);
  /** 지금 답장을 쓰고 있는 제보와 그 글 */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const pick = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setFailed(null);
  }, []);

  // 누가 열라고 하면 연다. 학교 화면에서 부르면 그 학교와 갈래가 함께 온다
  useEffect(() => {
    const onOpen = (e: Event) => {
      const s = (e as CustomEvent<ReportSeed>).detail ?? {};
      setSeed(s);
      if (s.kind) setKind(s.kind);
      setTab("send");
      setFailed(null);
      setOpen(true);
    };
    window.addEventListener(REPORT_EVENT, onOpen);
    return () => window.removeEventListener(REPORT_EVENT, onOpen);
  }, []);

  /**
   * 운영인가 — 창을 열 때 한 번 본다. `staff` 는 누구나 읽는 표라 조회가 싸다(§12-147).
   * ⛔ 실패해도 화면을 막지 않는다. 못 읽으면 그냥 운영이 아닌 것으로 둔다 —
   *    「받은 것」 탭이 안 보일 뿐이고, 진짜 가름은 DB 가 한다.
   */
  useEffect(() => {
    if (!open || staff !== null) return;
    let alive = true;
    (async () => {
      const { data } = await authClient().auth.getUser();
      const uid = data.user?.id;
      if (!uid) return alive && setStaff(false);
      const r = await authClient().from("staff").select("user_id").eq("user_id", uid).maybeSingle();
      if (alive) setStaff(!!r.data);
    })();
    return () => {
      alive = false;
    };
  }, [open, staff]);

  /** 받은 제보 — 운영이 「받은 것」을 처음 열 때 한 번 받는다. ⛔ 실패를 삼키지 않는다 */
  useEffect(() => {
    if (!open || tab !== "inbox" || inbox !== null) return;
    let alive = true;
    authClient()
      .from("reports")
      .select("id, created_at, kind, body, status, reply, replied_at, sido, std_code, page, report_files(id, path, name, bytes)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setFailed(`받은 제보를 못 읽었습니다 — ${error.message}`);
          return;
        }
        setInbox((data ?? []) as unknown as Inbox[]);
      });
    return () => {
      alive = false;
    };
  }, [open, tab, inbox]);

  /** 답장을 달고 「반영」으로 넘긴다. ⛔ 실패를 화면이 버리지 않는다(§11-2) */
  const answer = useCallback(async (id: string, text: string, done: boolean) => {
    setBusy(true);
    try {
      const patch = text.trim()
        ? { reply: text.trim(), replied_at: new Date().toISOString(), status: done ? "done" : "new" }
        : { status: done ? "done" : "new" };
      const { error } = await authClient().from("reports").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      setInbox((v) => (v ?? []).map((r) => (r.id === id ? { ...r, ...patch } as Inbox : r)));
      setReplyTo(null);
      setReplyText("");
      toast(done ? "반영으로 넘겼습니다" : "답장을 달았습니다");
    } catch (e) {
      setFailed(`못 고쳤습니다 — ${e instanceof Error ? e.message : String(e)}`);
      toast("제보를 못 고쳤습니다", "fail");
    }
    setBusy(false);
  }, []);

  /**
   * 붙은 파일을 연다. ⛔ **버킷이 비공개라 주소를 그냥 못 쓴다** — 60초짜리 서명 주소를 그때 받는다.
   * ⛔ 실패하면 조용히 아무 일도 안 일어나게 두지 않는다.
   */
  const openFile = useCallback(async (path: string) => {
    const { data, error } = await authClient().storage.from("reports").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      setFailed(`파일을 못 열었습니다 — ${error?.message ?? "주소를 못 받았습니다"}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }, []);

  // Esc 로 닫는다
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /**
   * 「보낸 것」 탭을 처음 열 때 한 번 받는다.
   * ⛔ 창을 열 때마다 받지 않는다 — 답장은 자주 안 바뀌는데 열 때마다 한 번씩 부르면 낭비다.
   * ⛔ 실패를 삼키지 않는다.
   */
  useEffect(() => {
    if (!open || tab !== "sent" || mine !== null) return;
    let alive = true;
    (async () => {
      /**
       * ⛔ **`user_id` 를 반드시 건다.** 정책이 둘(본인 · 운영)이라 **운영에게는 남의 제보까지 온다** —
       *    안 걸면 사장님 화면의 「보낸 것」에 남이 보낸 것이 섞인다. 그건 「받은 것」 탭이 할 일이다.
       */
      const { data: me } = await authClient().auth.getUser();
      const uid = me.user?.id;
      if (!uid) return alive && setMine([]);
      const { data, error } = await authClient()
        .from("reports")
        .select("id, created_at, kind, body, status, reply, replied_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!alive) return;
      if (error) {
        setFailed(`보낸 제보를 못 받았습니다 — ${error.message}`);
        return;
      }
      setMine((data ?? []) as Mine[]);
    })();
    return () => {
      alive = false;
    };
  }, [open, tab, mine]);

  /** 로그인한 사람인가. ⛔ 손님(익명)은 아니다 — `lib/auth/server.ts` 의 `currentMember` 와 같은 기준 */
  const memberOrLogin = useCallback(async () => {
    const { data } = await authClient().auth.getUser();
    const u = data.user;
    if (!u || u.is_anonymous) {
      close();
      openLogin();
      return null;
    }
    return u;
  }, [close]);

  /**
   * 파일을 올린다. **보내기 전에** 올려 두고, 보낼 때 제보 번호를 적는다.
   * ⛔ 상한을 조용히 자르지 않는다 — 넘치면 **그 파일만 거절하고 무엇이 왜 거절됐는지 적는다**(§11-1).
   * ⛔ 경로 첫 칸이 보낸 사람 아이디다. 정책이 그 칸만 보고 가른다.
   */
  const addFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      setFailed(null);
      const user = await memberOrLogin();
      if (!user) return;

      const room = FILE_MAX - shots.length;
      if (room <= 0) {
        setFailed(`파일은 ${FILE_MAX}개까지 붙습니다`);
        return;
      }
      const take = [...list].slice(0, room);
      const over = [...list].slice(room);
      const heavy = take.filter((f) => f.size > FILE_BYTES);
      const ok = take.filter((f) => f.size <= FILE_BYTES);

      setBusy(true);
      const added: Shot[] = [];
      let why: string | null = null;
      for (const f of ok) {
        // ⛔ 파일 이름을 경로에 그대로 쓰지 않는다 — 한글·공백·같은 이름이 부딪힌다
        const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")) : "";
        const path = `${user.id}/${crypto.randomUUID()}${ext}`;
        try {
          const up = await authClient().storage.from("reports").upload(path, f, { contentType: f.type || undefined });
          if (up.error) throw new Error(up.error.message);
          const row = await authClient()
            .from("report_files")
            .insert({ user_id: user.id, path, name: f.name, bytes: f.size })
            .select("id")
            .single();
          if (row.error) throw new Error(row.error.message);
          added.push({ id: row.data.id as string, path, name: f.name, bytes: f.size });
        } catch (e) {
          why = e instanceof Error ? e.message : String(e);
          break;
        }
      }
      setShots((v) => [...v, ...added]);
      setBusy(false);

      const notes = [
        why ? `올리지 못했습니다 — ${why}` : null,
        heavy.length ? `${heavy.length}개는 ${kb(FILE_BYTES)} 를 넘어 뺐습니다` : null,
        over.length ? `${over.length}개는 ${FILE_MAX}개를 넘어 뺐습니다` : null,
      ].filter(Boolean);
      if (notes.length) setFailed(notes.join(" · "));
    },
    [memberOrLogin, shots.length],
  );

  const dropFile = useCallback(async (s: Shot) => {
    setBusy(true);
    try {
      await authClient().storage.from("reports").remove([s.path]);
      const { error } = await authClient().from("report_files").delete().eq("id", s.id);
      if (error) throw new Error(error.message);
      setShots((v) => v.filter((x) => x.id !== s.id));
    } catch (e) {
      setFailed(`파일을 빼지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  }, []);

  const send = useCallback(async () => {
    const text = body.trim();
    if (!text) return;
    setFailed(null);
    const user = await memberOrLogin();
    if (!user) return;

    setSending(true);
    try {
      const { data, error } = await authClient()
        .from("reports")
        .insert({
          kind,
          body: text,
          std_code: seed.stdCode ?? null,
          sido: seed.sido ?? null,
          page: typeof window === "undefined" ? null : window.location.pathname + window.location.search,
          user_id: user.id,
          ua: navigator.userAgent.slice(0, 300),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      // 방금 올린 파일에 제보 번호를 적는다. ⛔ 여기서 실패해도 제보는 이미 들어갔다 — 그렇게 말한다
      if (shots.length) {
        const link = await authClient()
          .from("report_files")
          .update({ report_id: data.id })
          .in("id", shots.map((s) => s.id));
        if (link.error) {
          toast("제보는 보냈는데 파일이 안 붙었습니다", "fail");
          setFailed(`파일을 잇지 못했습니다 — ${link.error.message}. 파일만 다시 보내 주십시오.`);
          setSending(false);
          setBody("");
          setShots([]);
          setMine(null);
          return;
        }
      }

      setBody("");
      setShots([]);
      setMine(null); // 「보낸 것」을 다시 받게 한다
      setSending(false);
      close();
      toast("제보를 보냈습니다");
    } catch (e) {
      setSending(false);
      setFailed(`보내지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
      toast("제보를 보내지 못했습니다", "fail");
    }
  }, [body, kind, seed.stdCode, shots, memberOrLogin, close]);

  if (!open) return null;

  const left = BODY_MAX - body.length;
  const tooLong = left < 0;
  const hint = REPORT_KINDS.find((k) => k.key === kind)?.hint ?? "";

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[300] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
        onClick={close}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="제보"
          onClick={(e) => e.stopPropagation()}
          className="glass-modal max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-panel p-5 sm:rounded-panel"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold tracking-tight">제보</h2>
              {/* ⛔ 학교·시·도가 안 담겨 오면 **아무것도 안 적는다**(2026-08-23 사장님 —
                  「틀린 값 · 내년 자리 · 교육청 문서 는 삭제」). 갈래는 아래 알약이 이미 말한다. */}
              {(seed.schoolName || seed.sido) && (
                <p className="mt-0.5 truncate text-[13px] text-ink3">
                  {seed.schoolName ?? `${seed.sido} 인사구역`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              className="-mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-chip active:bg-fill"
            >
              <X size={18} strokeWidth={2} className="text-ink3" aria-hidden />
            </button>
          </div>

          {/* 탭 둘 — 보내기 · 보낸 것(답장을 여기서 읽는다) */}
          <div className="mt-3 flex gap-1.5">
            {(
              [
                ["send", "보내기"],
                ["sent", "보낸 것"],
                ...(staff ? ([["inbox", "받은 것"]] as const) : []),
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k);
                  setFailed(null);
                }}
                aria-current={tab === k ? "true" : undefined}
                className={`flex h-11 flex-1 items-center justify-center rounded-chip text-[13.5px] font-semibold active:opacity-80 ${
                  tab === k ? "bg-[var(--key-fill)] text-white" : "glass-2 text-ink2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {failed && (
            <p role="alert" className="mt-3 rounded-card border border-line px-3 py-2.5 text-[13px]">
              {failed}
            </p>
          )}

          {tab === "send" ? (
            <>
              {/* 갈래 셋 — 사장님이 나눈 그대로 */}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {REPORT_KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setKind(k.key)}
                    aria-pressed={kind === k.key}
                    className={`flex min-h-11 items-center justify-center rounded-chip px-2 text-center text-[12.5px] font-semibold leading-tight active:opacity-80 ${
                      kind === k.key ? "bg-[var(--key-fill)] text-white" : "glass-2 text-ink2"
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={hint}
                aria-label={`${REPORT_LABEL[kind]} 내용`}
                rows={5}
                className="mt-2.5 w-full resize-y rounded-card border border-divider bg-fill px-3 py-2.5 text-[14px] leading-relaxed outline-none placeholder:text-ink3"
              />

              <div className="mt-1 flex items-baseline gap-2">
                {/* ⛔ 남은 글자를 늘 보여준다. 넘으면 저장이 잠긴다 — 잘려서 사라지지 않는다 */}
                <span className={`text-[11.5px] tabular-nums ${tooLong ? "font-semibold text-up" : "text-ink3"}`}>
                  {left.toLocaleString()}자 남음
                </span>
                {/* ⛔ 「이 학교가 함께 갑니다」를 지웠다(2026-08-24 사장님 — 「이건 굳이…?」).
                    **머리줄에 학교 이름이 이미 적혀 있다** — 같은 말을 두 번 하는 자리였다. */}
              </div>

              {/* 파일 — 「인사 관련 문서」에서 주로 쓰지만 어느 갈래에서든 붙는다(오류는 화면 사진이 빠르다) */}
              <input
                ref={pick}
                type="file"
                multiple
                accept={FILE_ACCEPT}
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
              {/*
                ⭐ **끌어다 놓아도 붙는다**(2026-08-24 사장님 — 「문서받을 때는 **드래그앤 드랍**으로
                   넣을 수 있게 해주고」). 고시문은 이미 파일로 갖고 있는 것이라, 고르개를 여는 것보다
                   창으로 끌어 놓는 편이 짧다.
                ⛔ **`dragover` 에서 `preventDefault` 를 안 하면 브라우저가 그 파일을 열어 버린다** —
                   우리 화면이 통째로 사라지고 PDF 가 뜬다. 막는 것이 곧 받는 것이다.
                ⛔ 들어왔다 나가는 것을 세어서 판정한다(`depth`) — 안쪽 자식 위를 지날 때마다
                   `dragleave` 가 와서, 세지 않으면 **끌고 있는 도중에 표시가 깜빡인다.**
                ⛔ 단추는 그대로 둔다 — 폰에는 끌어 놓을 방법이 없다(§11-4).
              */}
              <button
                type="button"
                onClick={() => pick.current?.click()}
                disabled={busy}
                onDragEnter={(e) => {
                  e.preventDefault();
                  drag.current += 1;
                  setOver(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => {
                  drag.current = Math.max(0, drag.current - 1);
                  if (drag.current === 0) setOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drag.current = 0;
                  setOver(false);
                  void addFiles(e.dataTransfer.files);
                }}
                className={`mt-2.5 flex min-h-11 w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-card border border-dashed py-2 text-[13.5px] font-semibold text-ink2 active:opacity-80 disabled:opacity-50 ${
                  over ? "border-key bg-fill text-key" : "border-divider"
                }`}
              >
                <span className="flex items-center gap-2">
                  {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <FileUp size={16} aria-hidden />}
                  {over ? "여기에 놓으십시오" : "파일 붙이기"}
                </span>
                <span className="text-[11.5px] font-normal text-ink3">
                  {FILE_KINDS} · {FILE_MAX}개까지 · 하나에 {kb(FILE_BYTES)}
                </span>
              </button>

              {shots.length > 0 && (
                <ul className="mt-2 divide-y divide-divider rounded-card border border-divider">
                  {shots.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
                      <span className="shrink-0 text-[11.5px] tabular-nums text-ink3">{kb(s.bytes)}</span>
                      {/* ⛔ 호버 뒤에 숨기지 않는다 — 손가락에는 호버가 없다(§11-4) */}
                      <button
                        type="button"
                        onClick={() => void dropFile(s)}
                        aria-label={`${s.name} 빼기`}
                        className="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-chip active:bg-fill"
                      >
                        <Trash2 size={15} strokeWidth={1.8} className="text-ink3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || busy || tooLong || body.trim().length === 0}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-chip bg-[var(--key-fill)] text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-50"
              >
                {sending && <Loader2 size={16} className="animate-spin" aria-hidden />}
                보내기
              </button>

              {/*
                ⛔ **문구는 사장님이 적어 주신 그대로다**(2026-08-23). 「받는 것은 공개된 교육청
                   고시문까지입니다 · 내부 문서 · 유출 자료는 싣지 않습니다」는 **지우라고 하셨다.**
                ⛔ 「다른 사용자에게 안 보인다」는 남긴다 — 지우라고 하신 줄이 아니고,
                   마음 놓고 적게 하는 약속이다(표에도 그렇게 걸려 있다).
              */}
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink3">
                보내주신 제보와 문서들은 비교 검토 후 반영됩니다.
                <br />
                보낸 글과 파일은 다른 사용자에게 보이지 않습니다.
              </p>
            </>
          ) : tab === "inbox" ? (
            <div className="mt-3">
              {inbox === null ? (
                <p className="px-1 py-3 text-[13px] text-ink3">받은 제보를 읽는 중</p>
              ) : inbox.length === 0 ? (
                <p className="px-1 py-3 text-[13px] text-ink3">아직 받은 제보가 없습니다</p>
              ) : (
                <ul className="divide-y divide-divider rounded-card border border-divider">
                  {inbox.map((r) => (
                    <li key={r.id} className="px-3 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12.5px] font-semibold">{REPORT_LABEL[r.kind]}</span>
                        <span className="text-[11.5px] tabular-nums text-ink3">{day(r.created_at)}</span>
                        {r.sido && <span className="text-[11.5px] font-semibold text-ink3">{r.sido}</span>}
                        {r.std_code && <span className="text-[11.5px] tabular-nums text-ink3">{r.std_code}</span>}
                        {r.status === "done" && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-key">
                            <Check size={12} strokeWidth={2.4} aria-hidden />
                            반영
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink2">{r.body}</p>
                      {r.page && <p className="mt-1 truncate text-[11px] text-ink3">{r.page}</p>}

                      {!!r.report_files?.length && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {r.report_files.map((f) => (
                            <li key={f.id}>
                              <button
                                type="button"
                                onClick={() => void openFile(f.path)}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-card border border-divider px-2.5 text-[12.5px] active:opacity-60"
                              >
                                <FileUp size={13} strokeWidth={1.8} aria-hidden />
                                <span className="max-w-40 truncate">{f.name}</span>
                                <span className="tabular-nums text-ink3">{kb(f.bytes)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {r.reply && (
                        <p className="mt-1.5 rounded-card border border-line px-2.5 py-2 text-[12.5px] leading-relaxed">
                          <span className="font-semibold">답장</span> · {r.reply}
                        </p>
                      )}

                      {replyTo === r.id ? (
                        <div className="mt-2">
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={3}
                            aria-label="답장"
                            className="w-full resize-y rounded-card border border-divider bg-fill px-3 py-2 text-[13px] outline-none"
                          />
                          <div className="mt-1.5 flex gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void answer(r.id, replyText, false)}
                              className="flex min-h-11 flex-1 items-center justify-center rounded-chip glass-2 text-[13px] font-semibold text-ink2 active:opacity-80 disabled:opacity-50"
                            >
                              답장만
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void answer(r.id, replyText, true)}
                              className="flex min-h-11 flex-1 items-center justify-center rounded-chip bg-[var(--key-fill)] text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-50"
                            >
                              답장 · 반영
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo(r.id);
                            setReplyText(r.reply ?? "");
                          }}
                          className="mt-1 inline-flex min-h-11 items-center text-[12.5px] font-semibold text-key active:opacity-60"
                        >
                          답장 달기
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-3">
              {mine === null ? (
                <p className="px-1 py-3 text-[13px] text-ink3">보낸 제보를 받는 중</p>
              ) : mine.length === 0 ? (
                <p className="px-1 py-3 text-[13px] text-ink3">아직 보낸 제보가 없습니다</p>
              ) : (
                <ul className="divide-y divide-divider rounded-card border border-divider">
                  {mine.map((r) => (
                    <li key={r.id} className="px-3 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12.5px] font-semibold">{REPORT_LABEL[r.kind]}</span>
                        <span className="text-[11.5px] tabular-nums text-ink3">{day(r.created_at)}</span>
                        {r.status === "done" && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-key">
                            <Check size={12} strokeWidth={2.4} aria-hidden />
                            반영
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink2">{r.body}</p>
                      {r.reply && (
                        <p className="mt-1.5 rounded-card border border-line px-2.5 py-2 text-[12.5px] leading-relaxed">
                          <span className="font-semibold">답장</span> · {r.reply}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

import { redirect } from "next/navigation";

/**
 * `/login` 은 이제 **화면이 아니라 문**이다 — 지도로 보내면서 모달을 열게 한다.
 *
 * 2026-08-23 사장님 — 「회원가입과 로그인 모두 **지도창 위의 모달에서** 진행하면 좋겠음」(§12-144).
 * §12-95 「지도화면에서 나가는 페이지는 만들지마」와 같은 줄기다.
 *
 * ⛔ **지우지 않고 남긴다.** 즐겨찾기에 담아 둔 사람, 바깥에서 걸린 링크, 옛 화면이 아직 부른다.
 *    없애면 그 사람들이 404 를 본다.
 * ⛔ `?next=` 는 버린다 — 모달은 **지금 보고 있는 화면**으로 돌아온다(`hereAsNext`).
 *    여기까지 온 사람은 이미 지도를 떠난 뒤라 되돌릴 자리가 없다.
 */
export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const failed = typeof sp.error === "string" ? sp.error : null;
  redirect(failed ? `/map?login=1&error=${encodeURIComponent(failed)}` : "/map?login=1");
}

type InvitationMail = { email: string; link: string; workspaceName: string; inviterName: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function deliverInvitationMail(invitation: InvitationMail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_EMAIL_FROM;
  if (!apiKey || !from) return { delivered: false as const };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [invitation.email],
      subject: `${invitation.inviterName} 邀请你加入 ${invitation.workspaceName}`,
      html: `<p>你被邀请加入 <strong>${escapeHtml(invitation.workspaceName)}</strong>。</p><p><a href="${escapeHtml(invitation.link)}">设置密码并加入 Workspace</a></p><p>该链接将在 7 天后失效。</p>`,
    }),
  });
  if (!response.ok) throw new Error("邀请邮件发送失败");
  return { delivered: true as const };
}

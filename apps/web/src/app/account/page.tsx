import { useState } from "react";
import { Cookie, LogOut, Mail, ShieldCheck, Trash2, User } from "lucide-react";
import { openCookieSettings } from "../../lib/consent";

interface AccountPageProps {
  name: string;
  email: string;
  avatarUrl?: string | undefined;
  onSignOut: () => void;
}

export function AccountPage({ name, email, avatarUrl, onSignOut }: AccountPageProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <section className="page-panel account-page">
      <div className="section-header">
        <div>
          <span className="section-label">Sua conta</span>
          <h2>Perfil e preferências</h2>
        </div>
      </div>

      <div className="account-card">
        <div className="account-identity">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="account-avatar" />
          ) : (
            <div className="account-avatar-placeholder">
              <User size={26} aria-hidden="true" />
            </div>
          )}
          <div>
            <strong>{name}</strong>
            <span><Mail size={13} aria-hidden="true" /> {email}</span>
          </div>
        </div>
        <div className="account-plan">
          <ShieldCheck size={16} aria-hidden="true" />
          <div>
            <strong>Plano Free</strong>
            <small>Explore o produto. Faça upgrade em Planos.</small>
          </div>
        </div>
      </div>

      <div className="account-actions">
        <button className="account-action" type="button" onClick={openCookieSettings}>
          <Cookie size={18} aria-hidden="true" />
          <div>
            <strong>Gerenciar cookies</strong>
            <small>Revise seu consentimento de privacidade.</small>
          </div>
        </button>

        <button className="account-action" type="button" onClick={onSignOut}>
          <LogOut size={18} aria-hidden="true" />
          <div>
            <strong>Sair da conta</strong>
            <small>Encerrar a sessão neste dispositivo.</small>
          </div>
        </button>

        <button
          className="account-action account-action-danger"
          type="button"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={18} aria-hidden="true" />
          <div>
            <strong>Excluir minha conta</strong>
            <small>Remova seus dados permanentemente (LGPD).</small>
          </div>
        </button>
      </div>

      {confirmDelete && (
        <div className="account-confirm" role="dialog" aria-label="Confirmar exclusão">
          <p>
            Para excluir sua conta e seus dados, envie um pedido para{" "}
            <a href="mailto:privacidade@olli.com.br?subject=Excluir%20minha%20conta">privacidade@olli.com.br</a>.
            Concluímos em até 15 dias, conforme a LGPD.
          </p>
          <button className="ghost-button" type="button" onClick={() => setConfirmDelete(false)}>
            Fechar
          </button>
        </div>
      )}
    </section>
  );
}

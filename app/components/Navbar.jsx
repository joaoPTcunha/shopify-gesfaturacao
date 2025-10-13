import { Link } from "@remix-run/react";
import "../styles/navbar.css"; // Importa o arquivo CSS

export default function Navbar({ isAuthenticated }) {
  return (
    <nav
      className="navbar navbar-expand-lg custom-navbar fixed-top"
      lang="pt-PT"
    >
      <div className="container-fluid position-relative">
        <Link className="navbar-brand d-flex align-items-center ms-2" to="/">
          <img
            src="/icons/logo.png"
            alt="Logo GESFaturação"
            className="navbar-logo"
          />
        </Link>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Alternar navegação"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div
          className="collapse navbar-collapse justify-content-center"
          id="navbarNav"
        >
          <ul className="navbar-nav text-center">
            <li className="nav-item">
              <Link className="nav-link" to="/ges-orders">
                Encomendas
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" to="/ges-config">
                Configurações
              </Link>
            </li>
            {!isAuthenticated ? (
              <li className="nav-item">
                <Link className="nav-link" to="/ges-login">
                  Login
                </Link>
              </li>
            ) : (
              <li className="nav-item">
                <Link className="nav-link" to="/ges-logout">
                  Sair
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

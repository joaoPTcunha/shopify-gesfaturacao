import { Link } from "@remix-run/react";

export default function Navbar({ isAuthenticated }) {
  return (
    <nav
      className="navbar navbar-expand-lg navbar-dark bg-dark fixed-top"
      lang="pt-PT"
    >
      <div className="container-fluid">
        <Link className="navbar-brand" to="/">
          GESFaturação
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
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto">
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
            <li className="nav-item">
              <Link className="nav-link" to="/ges-login">
                Login
              </Link>
            </li>
            {isAuthenticated && (
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

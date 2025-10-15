import { Link, useLocation, useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import "../styles/navbar.css";

export default function Navbar({ isAuthenticated }) {
  const location = useLocation();
  const fetcher = useFetcher();
  const [authState, setAuthState] = useState(isAuthenticated);

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/ges-login?check=true");
    }
  }, [fetcher, location.pathname]);

  useEffect(() => {
    if (fetcher.data?.loggedIn !== undefined) {
      setAuthState(fetcher.data.loggedIn);
    }
  }, [fetcher.data]);

  const isAuth = fetcher.data?.loggedIn ?? isAuthenticated;

  useEffect(() => {
    import("bootstrap/dist/js/bootstrap.bundle.min.js").then((bootstrap) => {
      window.bootstrap = bootstrap;
    });
  }, []);

  useEffect(() => {
    const navLinks = document.querySelectorAll(".navbar-nav .nav-link");
    const navbarCollapse = document.getElementById("navbarNav");

    const handleClick = () => {
      if (navbarCollapse.classList.contains("show")) {
        const collapse = new window.bootstrap.Collapse(navbarCollapse);
        collapse.hide();
      }
    };

    navLinks.forEach((link) => link.addEventListener("click", handleClick));
    return () => {
      navLinks.forEach((link) =>
        link.removeEventListener("click", handleClick),
      );
    };
  }, []);

  useEffect(() => {
    const navbarCollapse = document.getElementById("navbarNav");
    const body = document.body;
    const navbarHeight = 10;

    const adjustBodyPadding = () => {
      const isMobile = window.innerWidth < 992;
      if (isMobile && navbarCollapse.classList.contains("show")) {
        const collapseHeight = navbarCollapse.offsetHeight;
        body.style.paddingTop = `${navbarHeight + collapseHeight}px`;
      } else {
        body.style.paddingTop = `${navbarHeight}px`;
      }
    };

    const observer = new MutationObserver(adjustBodyPadding);
    observer.observe(navbarCollapse, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("resize", adjustBodyPadding);

    adjustBodyPadding();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", adjustBodyPadding);
    };
  }, []);

  return (
    <div className="navbar-container">
      <nav
        className="navbar navbar-expand-lg custom-navbar fixed-top"
        lang="pt-PT"
      >
        <div className="container-fluid">
          <img
            src="/icons/logo.png"
            alt="Logo GESFaturação"
            className="navbar-logo"
          />

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
                <Link
                  className={`nav-link ${
                    location.pathname === "/ges-orders" ? "active" : ""
                  }`}
                  to="/ges-orders"
                >
                  Encomendas
                </Link>
              </li>

              <li className="nav-item">
                <Link
                  className={`nav-link ${
                    location.pathname === "/ges-config" ? "active" : ""
                  }`}
                  to="/ges-config"
                >
                  Configurações
                </Link>
              </li>

              <li className="nav-item">
                <Link
                  className={`nav-link ${
                    location.pathname ===
                    (isAuth ? "/ges-logout" : "/ges-login")
                      ? "active"
                      : ""
                  }`}
                  to={isAuth ? "/ges-logout" : "/ges-login"}
                >
                  {isAuth ? "Sair" : "Login"}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </div>
  );
}

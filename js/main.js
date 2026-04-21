/* ===================================================================
   YOUSIF'S PORTFOLIO — Main JavaScript
   Scroll Reveal · Theme Toggle · Section Navigation · Micro-animations
   =================================================================== */
(() => {
    let interactionsInitialized = false;

    /* ── Scroll Reveal (Intersection Observer) ── */
    function initScrollReveal() {
        const revealElements = document.querySelectorAll(
            ".reveal, .reveal-left, .reveal-right, .reveal-scale, .stagger-children"
        );
        if (!revealElements.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("revealed");
                        // Don't unobserve — allows re-reveal if needed
                    }
                });
            },
            {
                threshold: 0.12,
                rootMargin: "0px 0px -40px 0px",
            }
        );

        revealElements.forEach((el) => observer.observe(el));
    }

    /* ── Typing Animation for Hero ── */
    function initTypingAnimation() {
        const subtitleEl = document.getElementById("home-subtitle");
        if (!subtitleEl || !subtitleEl.textContent.trim()) return;

        const text = subtitleEl.textContent.trim();
        subtitleEl.textContent = "";
        subtitleEl.style.visibility = "visible";

        // Add cursor
        const cursor = document.createElement("span");
        cursor.className = "typing-cursor";
        subtitleEl.appendChild(cursor);

        let charIndex = 0;
        const typeSpeed = 60;

        function type() {
            if (charIndex < text.length) {
                subtitleEl.insertBefore(
                    document.createTextNode(text.charAt(charIndex)),
                    cursor
                );
                charIndex++;
                setTimeout(type, typeSpeed);
            } else {
                // Remove cursor after 3 seconds
                setTimeout(() => {
                    cursor.remove();
                }, 3000);
            }
        }

        // Start after a short delay
        setTimeout(type, 500);
    }

    /* ── Counter Animation ── */
    function initCounterAnimation() {
        const counters = document.querySelectorAll(".about__info-title");
        if (!counters.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        animateCounter(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.5 }
        );

        counters.forEach((el) => observer.observe(el));
    }

    function animateCounter(element) {
        const text = element.textContent.trim();
        const match = text.match(/^(\d+)(\+?)$/);
        if (!match) return;

        const target = parseInt(match[1], 10);
        const suffix = match[2] || "";
        const duration = 1500;
        const startTime = performance.now();

        element.classList.add("count-up");

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(target * eased);

            element.textContent = current.toString().padStart(2, "0") + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    /* ── Skills Accordion ── */
    function initSkillsAccordion() {
        const skillsContent = document.getElementsByClassName("skills__content");
        const skillsHeader = document.querySelectorAll(".skills__header");

        const toggleSkills = function () {
            const itemClass = this.parentNode.className;

            for (let i = 0; i < skillsContent.length; i++) {
                skillsContent[i].className = "skills__content skills__close";
            }

            if (itemClass.includes("skills__close")) {
                this.parentNode.className = "skills__content skills__open";
            }
        };

        if (skillsHeader.length) {
            skillsHeader.forEach((el) => {
                el.addEventListener("click", toggleSkills);
            });
        }
    }

    /* ── Qualification Tabs ── */
    function initQualificationTabs() {
        const tabs = document.querySelectorAll("[data-target]");
        const tabContents = document.querySelectorAll("[data-content]");

        if (tabs.length && tabContents.length) {
            tabs.forEach((tab) => {
                tab.addEventListener("click", () => {
                    const target = document.querySelector(tab.dataset.target);
                    if (!target) return;

                    tabContents.forEach((tc) =>
                        tc.classList.remove("qualification__active")
                    );
                    target.classList.add("qualification__active");

                    tabs.forEach((t) =>
                        t.classList.remove("qualification__active")
                    );
                    tab.classList.add("qualification__active");
                });
            });
        }
    }

    /* ── Project Tabs ── */
    function initProjectTabs() {
        const projectTabs = document.querySelectorAll("[data-target-p]");
        const projectContents = document.querySelectorAll("[data-content-p]");

        if (projectTabs.length && projectContents.length) {
            projectTabs.forEach((tab) => {
                tab.addEventListener("click", () => {
                    const target = document.querySelector(tab.dataset.targetP);
                    if (!target) return;

                    projectContents.forEach((tc) =>
                        tc.classList.remove("projects__active")
                    );
                    target.classList.add("projects__active");

                    projectTabs.forEach((t) =>
                        t.classList.remove("projects__active")
                    );
                    tab.classList.add("projects__active");
                });
            });
        }
    }

    /* ── Service Modals ── */
    function initServiceModals() {
        const modalViews = document.querySelectorAll(".services__modal");
        const modalBtns = document.querySelectorAll(".services__button");
        const modalCloses = document.querySelectorAll(".services__modal-close");

        if (modalBtns.length && modalViews.length) {
            modalBtns.forEach((btn, i) => {
                btn.addEventListener("click", () => {
                    if (modalViews[i]) {
                        modalViews[i].classList.add("active-modal");
                    }
                });
            });
        }

        if (modalCloses.length) {
            modalCloses.forEach((close) => {
                close.addEventListener("click", () => {
                    modalViews.forEach((mv) =>
                        mv.classList.remove("active-modal")
                    );
                });
            });
        }

        // Close modal on backdrop click
        modalViews.forEach((mv) => {
            mv.addEventListener("click", (e) => {
                if (e.target === mv) {
                    mv.classList.remove("active-modal");
                }
            });
        });
    }

    /* ── Active Navigation on Scroll ── */
    function initScrollNav() {
        const sections = document.querySelectorAll("section[id]");

        function scrollActive() {
            const scrollY = window.pageYOffset;

            sections.forEach((current) => {
                const sectionHeight = current.offsetHeight;
                const sectionTop = current.offsetTop - 100;
                const sectionId = current.getAttribute("id");
                const link = document.querySelector(
                    `.nav__menu a[href*="#${sectionId}"]`
                );
                if (!link) return;

                if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                    link.classList.add("active-link");
                } else {
                    link.classList.remove("active-link");
                }
            });
        }

        window.addEventListener("scroll", scrollActive, { passive: true });
    }

    /* ── Header scroll effect ── */
    function initHeaderScroll() {
        const header = document.getElementById("header");
        if (!header) return;

        function scrollHeader() {
            if (window.scrollY >= 10) {
                header.classList.add("scroll-header");
            } else {
                header.classList.remove("scroll-header");
            }
        }

        window.addEventListener("scroll", scrollHeader, { passive: true });
    }

    /* ── Scroll Up Button ── */
    function initScrollUp() {
        const scrollUpEl = document.getElementById("scroll-up");
        if (!scrollUpEl) return;

        function scrollUp() {
            if (window.scrollY >= 400) {
                scrollUpEl.classList.add("show-scroll");
            } else {
                scrollUpEl.classList.remove("show-scroll");
            }
        }

        window.addEventListener("scroll", scrollUp, { passive: true });
    }

    /* ── Smooth scroll for anchor links ── */
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener("click", (e) => {
                const href = anchor.getAttribute("href");
                if (href === "#") return;
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                    });
                }
            });
        });
    }

    /* ── Main Init ── */
    function initializePortfolioUI() {
        if (interactionsInitialized) return;
        interactionsInitialized = true;

        initScrollReveal();
        initTypingAnimation();
        initCounterAnimation();
        initSkillsAccordion();
        initQualificationTabs();
        initProjectTabs();
        initServiceModals();
        initScrollNav();
        initHeaderScroll();
        initScrollUp();
        initSmoothScroll();
    }

    /* ── Theme Toggle ── */
    function setupThemeToggle() {
        const themeButton = document.getElementById("theme-button");
        if (!themeButton) return;

        const darkTheme = "dark-theme";
        const iconTheme = "uil-sun";

        const selectedTheme = localStorage.getItem("selected-theme");
        const selectedIcon = localStorage.getItem("selected-icon");

        const getCurrentTheme = () =>
            document.body.classList.contains(darkTheme) ? "dark" : "light";
        const getCurrentIcon = () =>
            themeButton.classList.contains(iconTheme) ? "uil-moon" : "uil-sun";

        if (selectedTheme) {
            document.body.classList[
                selectedTheme === "dark" ? "add" : "remove"
            ](darkTheme);
            themeButton.classList[
                selectedIcon === "uil-moon" ? "add" : "remove"
            ](iconTheme);
        }

        themeButton.addEventListener("click", () => {
            document.body.classList.toggle(darkTheme);
            themeButton.classList.toggle(iconTheme);
            localStorage.setItem("selected-theme", getCurrentTheme());
            localStorage.setItem("selected-icon", getCurrentIcon());
        });
    }

    document.addEventListener("DOMContentLoaded", setupThemeToggle);

    window.initializePortfolioUI = initializePortfolioUI;
    window.resetPortfolioUI = () => {
        interactionsInitialized = false;
        initializePortfolioUI();
    };
})();

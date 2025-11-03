(() => {
    let interactionsInitialized = false;

    function initializePortfolioUI() {
        if (interactionsInitialized) return;
        interactionsInitialized = true;

        const skillsContent = document.getElementsByClassName("skills__content");
        const skillsHeader = document.querySelectorAll(".skills__header");

        const toggleSkills = function () {
            const itemClass = this.parentNode.className;

            for (let i = 0; i < skillsContent.length; i++) {
                skillsContent[i].className = "skills__content skills__close";
            }

            if (itemClass === "skills__content skills__close") {
                this.parentNode.className = "skills__content skills__open";
            }
        };

        if (skillsHeader.length) {
            skillsHeader.forEach((el) => {
                el.addEventListener("click", toggleSkills);
            });
        }

        const tabs = document.querySelectorAll("[data-target]");
        const tabContents = document.querySelectorAll("[data-content]");

        if (tabs.length && tabContents.length) {
            tabs.forEach((tab) => {
                tab.addEventListener("click", () => {
                    const target = document.querySelector(tab.dataset.target);
                    if (!target) return;

                    tabContents.forEach((tabContent) => {
                        tabContent.classList.remove("qualification__active");
                    });
                    target.classList.add("qualification__active");

                    tabs.forEach((item) => {
                        item.classList.remove("qualification__active");
                    });
                    tab.classList.add("qualification__active");
                });
            });
        }

        const projectTabs = document.querySelectorAll("[data-target-p]");
        const projectContents = document.querySelectorAll("[data-content-p]");

        if (projectTabs.length && projectContents.length) {
            projectTabs.forEach((tab) => {
                tab.addEventListener("click", () => {
                    const target = document.querySelector(tab.dataset.targetP);
                    if (!target) return;

                    projectContents.forEach((tabContent) => {
                        tabContent.classList.remove("projects__active");
                    });
                    target.classList.add("projects__active");

                    projectTabs.forEach((item) => {
                        item.classList.remove("projects__active");
                    });
                    tab.classList.add("projects__active");
                });
            });
        }

        const modalViews = document.querySelectorAll(".services__modal");
        const modalBtns = document.querySelectorAll(".services__button");
        const modalCloses = document.querySelectorAll(".services__modal-close");

        const openModal = function (modalClick) {
            if (modalViews[modalClick]) {
                modalViews[modalClick].classList.add("active-modal");
            }
        };

        if (modalBtns.length && modalViews.length) {
            modalBtns.forEach((modalBtn, i) => {
                modalBtn.addEventListener("click", () => {
                    openModal(i);
                });
            });
        }

        if (modalCloses.length) {
            modalCloses.forEach((modalClose) => {
                modalClose.addEventListener("click", () => {
                    modalViews.forEach((modalView) => {
                        modalView.classList.remove("active-modal");
                    });
                });
            });
        }

        const sections = document.querySelectorAll("section[id]");

        function scrollActive() {
            const scrollY = window.pageYOffset;

            sections.forEach((current) => {
                const sectionHeight = current.offsetHeight;
                const sectionTop = current.offsetTop - 50;
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

        window.addEventListener("scroll", scrollActive);

        function scrollHeader() {
            const nav = document.getElementById("header");
            if (!nav) return;

            if (window.scrollY >= 10) {
                nav.classList.add("scroll-header");
            } else {
                nav.classList.remove("scroll-header");
            }
        }
        window.addEventListener("scroll", scrollHeader);

        function scrollUp() {
            const scrollUpElement = document.getElementById("scroll-up");
            if (!scrollUpElement) return;

            if (window.scrollY >= 560) {
                scrollUpElement.classList.add("show-scroll");
            } else {
                scrollUpElement.classList.remove("show-scroll");
            }
        }
        window.addEventListener("scroll", scrollUp);
    }

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
            document.body.classList[selectedTheme === "dark" ? "add" : "remove"](
                darkTheme
            );
            themeButton.classList[selectedIcon === "uil-moon" ? "add" : "remove"](
                iconTheme
            );
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

(() => {
    const LANG_STORAGE_KEY = "portfolio-language";
    const LANG_CONFIG = {
        en: {
            file: "content.json",
            dir: "ltr",
            toggleLabel: "العربية",
            ariaLabel: "Switch to Arabic"
        },
        ar: {
            file: "content-ar.json",
            dir: "rtl",
            toggleLabel: "English",
            ariaLabel: "التبديل إلى الإنجليزية"
        }
    };
    const XLINK_NS = "http://www.w3.org/1999/xlink";
    let currentLanguage = "en";
    let isLoading = false;

    document.addEventListener("DOMContentLoaded", initializeLocalization);

    async function initializeLocalization() {
        const savedLanguage = localStorage.getItem(LANG_STORAGE_KEY);
        if (savedLanguage && LANG_CONFIG[savedLanguage]) {
            currentLanguage = savedLanguage;
        }

        applyLanguageAttributes(currentLanguage);
        setupLanguageToggle();
        await loadContentFor(currentLanguage);
    }

    function setupLanguageToggle() {
        const toggle = document.getElementById("language-toggle");
        if (!toggle) return;

        toggle.addEventListener("click", () => {
            const nextLanguage = currentLanguage === "en" ? "ar" : "en";
            switchLanguage(nextLanguage);
        });

        updateLanguageToggle();
    }

    async function switchLanguage(lang) {
        if (!LANG_CONFIG[lang] || lang === currentLanguage) return;
        localStorage.setItem(LANG_STORAGE_KEY, lang);
        currentLanguage = lang;
        applyLanguageAttributes(currentLanguage);
        updateLanguageToggle();
        await loadContentFor(currentLanguage);
    }

    async function loadContentFor(lang) {
        const config = LANG_CONFIG[lang] ?? LANG_CONFIG.en;
        isLoading = true;
        try {
            const response = await fetch(`data/${config.file}`, {
                cache: "no-store"
            });
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            const data = await response.json();
            if (lang !== currentLanguage) {
                return;
            }
            renderContent(data, lang);
        } catch (error) {
            console.error("Failed to load site content:", error);
            if (lang !== "en") {
                isLoading = false;
                currentLanguage = "en";
                applyLanguageAttributes("en");
                updateLanguageToggle();
                await loadContentFor("en");
                return;
            }
        } finally {
            isLoading = false;
        }
    }

    function renderContent(data, lang) {
        if (!data) return;

        populateNavigation(data);
        populateHome(data.home);
        populateAbout(data.about);
        populateSkills(data.skills);
        populateQualification(data.qualification);
        populateServices(data.services);
        populateCTA(data.cta);
        populateProjects(data.projects);
        populateContact(data.contact);
        populateFooter(data.footer);
        populateScrollUp(data.scrollUp);

        applyLanguageAttributes(lang);
        updateLanguageToggle();

        if (typeof window.resetPortfolioUI === "function") {
            window.resetPortfolioUI();
        } else if (typeof window.initializePortfolioUI === "function") {
            window.initializePortfolioUI();
        }

        initSwipers();
    }

    function populateNavigation(data) {
        const logo = document.getElementById("nav-logo");
        const navMenu = document.getElementById("nav-menu");

        if (data.site?.title) {
            document.title = data.site.title;
        }

        if (logo && data.site?.logoText) {
            logo.textContent = data.site.logoText;
            logo.setAttribute("href", "#home");
        }

        if (!navMenu || !Array.isArray(data.navigation)) return;

        const existingAnchors = Array.from(navMenu.querySelectorAll("a"));

        data.navigation.forEach((link, index) => {
            if (!link?.id || !link?.label) return;

            let anchor = existingAnchors[index];
            if (!anchor) {
                anchor = document.createElement("a");
                if (index === 0) {
                    anchor.classList.add("active-link");
                }
                navMenu.appendChild(anchor);
            }

            anchor.href = `#${link.id}`;

            let name = anchor.querySelector(".nav__name");
            if (!name) {
                name = document.createElement("div");
                name.className = "nav__name";
                anchor.insertBefore(name, anchor.firstChild);
            }
            name.textContent = link.label;

            const existingIcon = anchor.querySelector(".nav__icon");
            if (existingIcon) {
                existingIcon.remove();
            }

            const newIcon = createIconElement(link.icon ?? "", link.label);
            newIcon.classList.add("nav__icon");
            anchor.appendChild(newIcon);
        });

        // Remove any leftover anchors if navigation data shrank
        if (existingAnchors.length > data.navigation.length) {
            existingAnchors.slice(data.navigation.length).forEach((anchor) => {
                if (anchor.parentElement === navMenu) {
                    anchor.remove();
                }
            });
        }
    }

    function populateHome(home) {
        if (!home) return;

        const socials = document.getElementById("home-social");
        if (socials) {
            socials.innerHTML = "";
            (home.socialLinks ?? []).forEach((item) => {
                if (!item?.url) return;
                const anchor = document.createElement("a");
                anchor.href = item.url;
                anchor.target = "_blank";
                anchor.rel = "noopener";
                anchor.className = "home__social-icon";

                const icon = createIconElement(item.icon ?? "", item.label);
                anchor.appendChild(icon);
                socials.appendChild(anchor);
            });
        }

        const homeImage = document.getElementById("home-image");
        if (homeImage && home.image?.src) {
            homeImage.setAttributeNS(XLINK_NS, "href", home.image.src);
        }

        const homeTitle = document.getElementById("home-title");
        if (homeTitle && home.title) {
            homeTitle.textContent = home.title;
        }

        const homeSubtitle = document.getElementById("home-subtitle");
        if (homeSubtitle && home.subtitle) {
            homeSubtitle.textContent = home.subtitle;
        }

        const homeDescription = document.getElementById("home-description");
        if (homeDescription && home.description) {
            homeDescription.textContent = home.description;
        }

        const cta = document.getElementById("home-cta");
        if (cta && home.cta) {
            cta.href = home.cta.href ?? "#contact";
            const label = document.getElementById("home-cta-label");
            const icon = document.getElementById("home-cta-icon");
            if (label && home.cta.label) {
                label.textContent = home.cta.label;
            }
            if (icon) {
                icon.className = `button__icon ${home.cta.icon ?? ""}`.trim();
            }
        }

        const scrollAnchor = document.getElementById("home-scroll");
        if (scrollAnchor && home.scroll) {
            scrollAnchor.href = home.scroll.href ?? "#about";
            const mouseIcon = document.getElementById("home-scroll-mouse");
            const scrollLabel = document.getElementById("home-scroll-label");
            const arrowIcon = document.getElementById("home-scroll-arrow");
            if (mouseIcon) {
                mouseIcon.className = `home__scroll-mouse ${home.scroll.mouseIcon ?? ""}`.trim();
            }
            if (scrollLabel && home.scroll.label) {
                scrollLabel.textContent = home.scroll.label;
            }
            if (arrowIcon) {
                arrowIcon.className = `home__scroll-arrow ${home.scroll.arrowIcon ?? ""}`.trim();
            }
        }
    }

    function populateAbout(about) {
        if (!about) return;

        const title = document.getElementById("about-title");
        if (title && about.title) {
            title.textContent = about.title;
        }

        const subtitle = document.getElementById("about-subtitle");
        if (subtitle && about.subtitle) {
            subtitle.textContent = about.subtitle;
        }

        const image = document.getElementById("about-image");
        if (image && about.image?.src) {
            image.src = about.image.src;
            image.alt = about.image.alt ?? "";
        }

        const description = document.getElementById("about-description");
        if (description && about.description) {
            description.textContent = about.description;
        }

        const infoContainer = document.getElementById("about-info");
        if (infoContainer) {
            infoContainer.innerHTML = "";
            (about.stats ?? []).forEach((stat) => {
                if (!stat?.value || !stat?.label) return;
                const wrapper = document.createElement("div");
                const value = document.createElement("span");
                value.className = "about__info-title";
                value.textContent = stat.value;
                const label = document.createElement("span");
                label.className = "about__info-name";
                label.innerHTML = stat.label.replace(/\n/g, "<br />");
                wrapper.appendChild(value);
                wrapper.appendChild(label);
                infoContainer.appendChild(wrapper);
            });
        }

        const buttonsContainer = document.getElementById("about-buttons");
        if (buttonsContainer) {
            buttonsContainer.innerHTML = "";
            (about.buttons ?? []).forEach((button) => {
                if (!button?.label || !button?.href) return;
                const anchor = document.createElement("a");
                anchor.href = button.href;
                anchor.className = "button button--flex";
                if (button.download) {
                    anchor.setAttribute("download", "");
                }
                if (button.target) {
                    anchor.target = button.target;
                    anchor.rel = "noopener";
                }
                anchor.textContent = button.label;

                const icon = document.createElement("i");
                icon.className = `button__icon ${button.icon ?? ""}`.trim();
                anchor.appendChild(icon);
                buttonsContainer.appendChild(anchor);
            });
        }
    }

    function populateSkills(skills) {
        const titleEl = document.getElementById("skills-title");
        if (titleEl && skills?.title) {
            titleEl.textContent = skills.title;
        }

        const subtitleEl = document.getElementById("skills-subtitle");
        if (subtitleEl && skills?.subtitle) {
            subtitleEl.textContent = skills.subtitle;
        }

        const container = document.getElementById("skills-container");
        if (!container) return;

        const groups = Array.isArray(skills?.groups)
            ? skills.groups
            : Array.isArray(skills)
            ? skills
            : [];

        container.innerHTML = "";

        groups.forEach((group) => {
            if (!group?.title) return;

            const content = document.createElement("div");
            content.className = `skills__content ${group.isOpen ? "skills__open" : "skills__close"}`.trim();

            const header = document.createElement("div");
            header.className = "skills__header";

            const icon = document.createElement("i");
            icon.className = `${group.icon ?? ""} skills__icon`.trim();

            const titlesWrapper = document.createElement("div");
            const title = document.createElement("h1");
            title.className = "skills__title";
            title.textContent = group.title;
            titlesWrapper.appendChild(title);

            if (group.subtitle) {
                const subtitle = document.createElement("span");
                subtitle.className = "skills__subtitle";
                subtitle.textContent = group.subtitle;
                titlesWrapper.appendChild(subtitle);
            }

            const arrow = document.createElement("i");
            arrow.className = "uil uil-angle-down skills__arrow";

            header.appendChild(icon);
            header.appendChild(titlesWrapper);
            header.appendChild(arrow);
            content.appendChild(header);

            const list = document.createElement("div");
            list.className = "skills__list grid";

            (group.items ?? []).forEach((item) => {
                if (!item?.name) return;
                const data = document.createElement("div");
                data.className = "skills__data";

                const dataTitle = document.createElement("div");
                dataTitle.className = "skills__title";
                const name = document.createElement("h3");
                name.className = "skills__name";
                name.textContent = item.name;
                dataTitle.appendChild(name);

                const bar = document.createElement("div");
                bar.className = "skills__bar";

                const percentage = document.createElement("span");
                percentage.className = "skills__precentage";
                if (typeof item.percentage === "number") {
                    percentage.style.width = `${item.percentage}%`;
                } else {
                    percentage.style.width = "100%";
                }

                bar.appendChild(percentage);
                data.appendChild(dataTitle);
                data.appendChild(bar);
                list.appendChild(data);
            });

            content.appendChild(list);
            container.appendChild(content);
        });
    }

    function populateQualification(qualification) {
        if (!qualification) return;

        const tabsContainer = document.getElementById("qualification-tabs");
        const contentContainer = document.getElementById("qualification-content");
        if (!tabsContainer || !contentContainer) return;

        const titleEl = document.getElementById("qualification-title");
        if (titleEl && qualification.title) {
            titleEl.textContent = qualification.title;
        }

        const subtitleEl = document.getElementById("qualification-subtitle");
        if (subtitleEl && qualification.subtitle) {
            subtitleEl.textContent = qualification.subtitle;
        }

        tabsContainer.innerHTML = "";
        contentContainer.innerHTML = "";

        (qualification.tabs ?? []).forEach((tab, index) => {
            if (!tab?.id || !tab?.label) return;

            const tabButton = document.createElement("div");
            tabButton.className = "qualification__button button-flex";
            if (index === 0) {
                tabButton.classList.add("qualification__active");
            }
            tabButton.dataset.target = `#${tab.id}`;

            const iconWrapper = document.createElement("i");
            iconWrapper.className = "qualification__icon";
            const lord = document.createElement("lord-icon");
            if (tab.icon?.src) {
                lord.setAttribute("src", tab.icon.src);
            }
            if (tab.icon?.trigger) {
                lord.setAttribute("trigger", tab.icon.trigger);
            }
            if (tab.icon?.state) {
                lord.setAttribute("state", tab.icon.state);
            }
            if (tab.icon?.stroke) {
                lord.setAttribute("stroke", tab.icon.stroke);
            }
            iconWrapper.appendChild(lord);
            tabButton.appendChild(iconWrapper);
            tabButton.append(tab.label);
            tabsContainer.appendChild(tabButton);

            const content = document.createElement("div");
            content.className = "qualification__content";
            if (index === 0) {
                content.classList.add("qualification__active");
            }
            content.dataset.content = "";
            content.id = tab.id;

            const entries = qualification.entries?.[tab.id] ?? [];
            const entryHtml = entries
                .map((entry, entryIndex) => {
                    const infoHtml = createQualificationInfoHtml(entry);
                    const hasLine = entryIndex !== entries.length - 1;
                    const timelineHtml =
                        `<div>` +
                        `<span class="qualification__rounder"></span>` +
                        (hasLine ? `<span class="qualification__line"></span>` : "") +
                        `</div>`;

                    if (entry.alignment === "right") {
                        return (
                            `<div class="qualification__data">` +
                            `<div></div>` +
                            timelineHtml +
                            `<div>${infoHtml}</div>` +
                            `</div>`
                        );
                    }

                    return (
                        `<div class="qualification__data">` +
                        `<div class="left-qualification">${infoHtml}</div>` +
                        timelineHtml +
                        `<div></div>` +
                        `</div>`
                    );
                })
                .join("");

            content.innerHTML = entryHtml;
            contentContainer.appendChild(content);
        });
    }

    function createQualificationInfoHtml(entry) {
        const parts = [];

        if (entry?.title) {
            parts.push(
                `<h3 class="qualification__title">${escapeHtml(entry.title)}</h3>`
            );
        }

        if (entry?.subtitle) {
            parts.push(
                `<span class="qualification__subtitle">${escapeHtml(entry.subtitle)}</span>`
            );
        }

        if (entry?.period) {
            parts.push(
                `<div class="qualification__calendar"><i class="uil uil-calendar-alt"></i>${escapeHtml(entry.period)}</div>`
            );
        }

        return parts.join("");
    }

    function populateServices(services) {
        const titleEl = document.getElementById("services-title");
        if (titleEl && services?.title) {
            titleEl.textContent = services.title;
        }

        const subtitleEl = document.getElementById("services-subtitle");
        if (subtitleEl && services?.subtitle) {
            subtitleEl.textContent = services.subtitle;
        }

        const container = document.getElementById("services-container");
        if (!container) return;

        const items = Array.isArray(services?.items)
            ? services.items
            : Array.isArray(services)
            ? services
            : [];

        container.innerHTML = "";

        items.forEach((service) => {
            if (!service?.title) return;

            const content = document.createElement("div");
            content.className = "services__content";

            const header = document.createElement("div");
            const icon = document.createElement("i");
            icon.className = `${service.icon ?? ""} services__icon`.trim();
            const title = document.createElement("h3");
            title.className = "services__title";
            title.textContent = service.title;

            header.appendChild(icon);
            header.appendChild(title);

            const button = document.createElement("span");
            button.className = "button button--flex button--small button--link services__button";
            button.textContent = "View More";
            const buttonIcon = document.createElement("i");
            buttonIcon.className = "uil uil-arrow-right button__icon";
            button.appendChild(buttonIcon);

            const modal = document.createElement("div");
            modal.className = "services__modal";
            const modalContent = document.createElement("div");
            modalContent.className = "services__modal-content";

            const modalTitle = document.createElement("h4");
            modalTitle.className = "services__modal-title";
            modalTitle.textContent = service.modalTitle ?? service.title;

            const modalClose = document.createElement("i");
            modalClose.className = "uil uil-times services__modal-close";

            const featuresList = document.createElement("ul");
            featuresList.className = "services__modal-services grid";
            (service.features ?? []).forEach((feature) => {
                if (!feature) return;
                const item = document.createElement("li");
                item.className = "services__modal-service";
                const check = document.createElement("i");
                check.className = "uil uil-check services__modal-icon";
                const text = document.createElement("p");
                text.textContent = feature;
                item.appendChild(check);
                item.appendChild(text);
                featuresList.appendChild(item);
            });

            modalContent.appendChild(modalTitle);
            modalContent.appendChild(modalClose);
            modalContent.appendChild(featuresList);
            modal.appendChild(modalContent);

            content.appendChild(header);
            content.appendChild(button);
            content.appendChild(modal);

            container.appendChild(content);
        });
    }

    function populateCTA(cta) {
        if (!cta) return;
        const title = document.getElementById("cta-title");
        if (title && cta.title) {
            title.textContent = cta.title;
        }
        const description = document.getElementById("cta-description");
        if (description && cta.description) {
            description.textContent = cta.description;
        }
        const button = document.getElementById("cta-button");
        if (button && cta.button) {
            button.href = cta.button.href ?? "#contact";
            const label = document.getElementById("cta-button-label");
            const icon = document.getElementById("cta-button-icon");
            if (label && cta.button.label) {
                label.textContent = cta.button.label;
            }
            if (icon) {
                icon.className = `project__icon button__icon ${cta.button.icon ?? ""}`.trim();
            }
        }
    }

    function populateProjects(projects) {
        if (!projects) return;

        const title = document.getElementById("projects-title");
        if (title && projects.title) {
            title.textContent = projects.title;
        }

        const subtitle = document.getElementById("projects-subtitle");
        if (subtitle) {
            subtitle.innerHTML = "";
            if (projects.subtitle?.heading) {
                subtitle.append(projects.subtitle.heading);
                subtitle.appendChild(document.createElement("br"));
            }
            if (projects.subtitle?.cta) {
                const ctaText = document.createElement("span");
                ctaText.textContent = projects.subtitle.cta.text ?? "";
                const link = document.createElement("a");
                link.href = projects.subtitle.cta.href ?? "#";
                link.target = "_blank";
                link.rel = "noopener";
                link.className = "home__social-icon";
                const icon = document.createElement("i");
                icon.className = projects.subtitle.cta.icon ?? "";
                link.appendChild(icon);
                ctaText.append(" ");
                ctaText.appendChild(link);
                subtitle.appendChild(ctaText);
            }
        }

        const tabsContainer = document.getElementById("projects-tabs");
        const sectionContainer = document.getElementById("projects-section");
        if (!tabsContainer || !sectionContainer) return;

        tabsContainer.innerHTML = "";
        sectionContainer.innerHTML = "";

        (projects.tabs ?? []).forEach((tab, index) => {
            if (!tab?.id || !tab?.label) return;

            const button = document.createElement("div");
            button.className = "projects__button button-flex";
            if (index === 0) {
                button.classList.add("projects__active");
            }
            button.dataset.targetP = `#${tab.id}`;
            const icon = document.createElement("i");
            icon.className = `${tab.icon ?? ""} projects__icon`.trim();
            button.appendChild(icon);
            button.append(tab.label);
            tabsContainer.appendChild(button);

            const content = document.createElement("div");
            content.className = "projects__content";
            if (index === 0) {
                content.classList.add("projects__active");
            }
            content.dataset.contentP = "";
            content.id = tab.id;

            const swiper = document.createElement("div");
            swiper.className = "swiper mySwiper";
            const wrapper = document.createElement("div");
            wrapper.className = "swiper-wrapper";

            const groupProjects = projects.groups?.[tab.id] ?? [];
            groupProjects.forEach((project) => {
                const slide = createProjectSlide(project);
                if (slide) {
                    wrapper.appendChild(slide);
                }
            });

            swiper.appendChild(wrapper);

            const nextButton = document.createElement("div");
            nextButton.className = "swiper-button-next";
            const nextIcon = document.createElement("i");
            nextIcon.className = "uil uil-angle-right swiper-projects-icon";
            nextButton.appendChild(nextIcon);

            const prevButton = document.createElement("div");
            prevButton.className = "swiper-button-prev";
            const prevIcon = document.createElement("i");
            prevIcon.className = "uil uil-angle-left swiper-projects-icon";
            prevButton.appendChild(prevIcon);

            const pagination = document.createElement("div");
            pagination.className = "swiper-pagination";

            swiper.appendChild(nextButton);
            swiper.appendChild(prevButton);
            swiper.appendChild(pagination);
            content.appendChild(swiper);
            sectionContainer.appendChild(content);
        });
    }

    function createProjectSlide(project) {
        if (!project?.title) return null;

        const slide = document.createElement("div");
        slide.className = "project__content grid swiper-slide";

        const media = createProjectMedia(project.images ?? []);
        if (media) {
            slide.appendChild(media);
        }

        const data = document.createElement("div");
        data.className = "projects__data";

        const title = document.createElement("h3");
        title.className = "project__title";
        title.textContent = project.title;
        data.appendChild(title);

        if (project.description) {
            const description = document.createElement("p");
            description.className = "project__description";
            description.textContent = project.description;
            data.appendChild(description);
        }

        if (project.cta?.label && project.cta?.href) {
            const button = document.createElement("a");
            button.className = "button button--flex button--small project__button";
            button.href = project.cta.href;
            if (isExternalLink(project.cta.href)) {
                button.target = "_blank";
                button.rel = "noopener";
            }
            button.textContent = project.cta.label;
            const icon = document.createElement("i");
            icon.className = project.cta.icon ?? "";
            icon.classList.add("button__icon");
            button.appendChild(icon);
            data.appendChild(button);
        }

        slide.appendChild(data);
        return slide;
    }

    function createProjectMedia(images) {
        if (!images.length) return null;

        if (images.length === 1) {
            const image = images[0];
            if (!image?.src) return null;
            const img = document.createElement("img");
            img.src = image.src;
            img.alt = image.alt ?? "";
            img.className = "project__img";
            return img;
        }

        const gallery = document.createElement("div");
        gallery.className = "project__media";
        images.forEach((image) => {
            if (!image?.src) return;
            const img = document.createElement("img");
            img.src = image.src;
            img.alt = image.alt ?? "";
            img.className = "project__img";
            if (image.style) {
                Object.entries(image.style).forEach(([prop, value]) => {
                    img.style[prop] = value;
                });
            }
            gallery.appendChild(img);
        });
        return gallery;
    }

    function initSwipers() {
        if (typeof Swiper === "undefined") return;

        document.querySelectorAll(".mySwiper").forEach((swiperEl) => {
            const nextEl = swiperEl.querySelector(".swiper-button-next");
            const prevEl = swiperEl.querySelector(".swiper-button-prev");
            const paginationEl = swiperEl.querySelector(".swiper-pagination");

            new Swiper(swiperEl, {
                effect: "cards",
                grabCursor: true,
                spaceBetween: 30,
                centeredSlides: true,
                autoplay: {
                    delay: 5000,
                    disableOnInteraction: false,
                },
                pagination: {
                    el: paginationEl,
                    clickable: true,
                    dynamicBullets: true,
                },
                navigation: {
                    nextEl,
                    prevEl,
                },
            });
        });
    }

    function populateContact(contact) {
        if (!contact) return;

        const title = document.getElementById("contact-title");
        if (title && contact.title) {
            title.textContent = contact.title;
        }
        const subtitle = document.getElementById("contact-subtitle");
        if (subtitle && contact.subtitle) {
            subtitle.textContent = contact.subtitle;
        }

        const cardsContainer = document.getElementById("contact-cards");
        if (cardsContainer) {
            cardsContainer.innerHTML = "";
            (contact.cards ?? []).forEach((card) => {
                if (!card?.title || !card?.value) return;
                const info = document.createElement("div");
                info.className = "contact__information";
                const icon = document.createElement("i");
                icon.className = `${card.icon ?? ""} contact__icon`.trim();
                const content = document.createElement("div");
                const cardTitle = document.createElement("h3");
                cardTitle.className = "contact__title";
                cardTitle.textContent = card.title;
                const value = document.createElement("span");
                value.className = "contact__subtitle";
                value.textContent = card.value;
                content.appendChild(cardTitle);
                content.appendChild(value);
                info.appendChild(icon);
                info.appendChild(content);
                cardsContainer.appendChild(info);
            });
        }

        const socialsContainer = document.getElementById("contact-socials");
        if (socialsContainer) {
            socialsContainer.innerHTML = "";
            (contact.socialLinks ?? []).forEach((item) => {
                if (!item?.url) return;
                const anchor = document.createElement("a");
                anchor.href = item.url;
                anchor.target = "_blank";
                anchor.rel = "noopener";
                anchor.className = "home__social-icon";
                const icon = createIconElement(item.icon ?? "", item.label);
                anchor.appendChild(icon);
                socialsContainer.appendChild(anchor);
            });
        }

        const placeholders = contact.form?.placeholders ?? {};
        setInputPlaceholder("name", placeholders.name);
        setInputPlaceholder("email", placeholders.email);
        setInputPlaceholder("project", placeholders.project);
        setInputPlaceholder("message", placeholders.message);

        const submitButton = document.getElementById("contact-submit");
        if (submitButton && contact.form?.button) {
            const label = document.getElementById("contact-submit-label");
            const icon = document.getElementById("contact-submit-icon");
            if (label && contact.form.button.label) {
                label.textContent = contact.form.button.label;
            }
            if (icon) {
                icon.className = `button__icon ${contact.form.button.icon ?? ""}`.trim();
            }
        }
    }

    function setInputPlaceholder(id, value) {
        if (!value) return;
        const element = document.getElementById(id);
        if (element) {
            element.setAttribute("placeholder", value);
        }
    }

    function populateFooter(footer) {
        if (!footer) return;

        const title = document.getElementById("footer-title");
        if (title && footer.title) {
            title.textContent = footer.title;
        }

        const subtitle = document.getElementById("footer-subtitle");
        if (subtitle && footer.subtitle) {
            subtitle.textContent = footer.subtitle;
        }

        const linksContainer = document.getElementById("footer-links");
        if (linksContainer) {
            linksContainer.innerHTML = "";
            (footer.links ?? []).forEach((link) => {
                if (!link?.href || !link?.label) return;
                const item = document.createElement("li");
                const anchor = document.createElement("a");
                anchor.href = link.href;
                anchor.className = "footer__link";
                anchor.textContent = link.label;
                item.appendChild(anchor);
                linksContainer.appendChild(item);
            });
        }

        const socialsContainer = document.getElementById("footer-socials");
        if (socialsContainer) {
            socialsContainer.innerHTML = "";
            (footer.socials ?? []).forEach((social) => {
                if (!social?.url) return;
                const anchor = document.createElement("a");
                anchor.href = social.url;
                anchor.target = "_blank";
                anchor.rel = "noopener";
                anchor.className = "footer__social";
                const icon = createIconElement(social.icon ?? "", social.label);
                anchor.appendChild(icon);
                socialsContainer.appendChild(anchor);
            });
        }

        const copy = document.getElementById("footer-copy");
        if (copy && footer.copy) {
            copy.textContent = footer.copy;
        }
    }

    function populateScrollUp(scrollUp) {
        const scrollUpElement = document.getElementById("scroll-up");
        const icon = document.getElementById("scroll-up-icon");
        if (!scrollUpElement || !icon) return;

        icon.className = `scrollup__icon ${scrollUp?.icon ?? "uil uil-arrow-up"}`.trim();
        scrollUpElement.href = "#home";
    }

    function isExternalLink(url) {
        return /^https?:\/\//i.test(url);
    }

    function escapeHtml(value) {
        if (value == null) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function createIconElement(iconClass, altText) {
        if (iconClass === "hf-icon") {
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("xmlns", svgNS);
            svg.setAttribute("viewBox", "0 0 32 32");
            svg.classList.add("hf-icon");
            svg.setAttribute("role", "img");
            svg.setAttribute("aria-label", altText || "Hugging Face");

            const path1 = document.createElementNS(svgNS, "path");
            path1.setAttribute("fill", "currentColor");
            path1.setAttribute(
                "d",
                "M3 15.9989C3 12.3286 4.10595 9.08911 6.23462 6.77759 8.35088 4.47956 11.5681 3 15.9989 3 20.4296 3 23.6469 4.47956 25.7631 6.77759 27.8918 9.08911 28.9978 12.3286 28.9978 15.9989 28.9978 16.4191 28.9833 16.8338 28.9544 17.242 29.2831 17.4208 29.5561 17.6892 29.7406 18.0143 30.1586 18.0645 30.537 18.2435 30.8348 18.5106 30.9437 17.691 30.9978 16.8516 30.9978 15.9989 30.9978 11.9378 29.7715 8.17785 27.2343 5.42276 24.6848 2.65419 20.9026 1 15.9989 1 11.0952 1 7.313 2.65419 4.76342 5.42276 2.22626 8.17785 1 11.9378 1 15.9989 1 16.8522 1.05414 17.6922 1.1632 18.5124 1.46131 18.2443 1.84042 18.0646 2.25935 18.0143 2.44347 17.6899 2.71568 17.422 3.04346 17.2431 3.01453 16.8345 3 16.4195 3 15.9989ZM12.668 28.6862C12.1997 29.368 11.558 29.9215 10.8065 30.283 12.3643 30.749 14.0973 30.9978 15.9989 30.9978 17.9011 30.9978 19.6345 30.7489 21.1927 30.2825 20.4414 29.921 19.7999 29.3675 19.3317 28.6858 18.3081 28.8894 17.1979 28.9978 15.9989 28.9978 14.8006 28.9978 13.691 28.8895 12.668 28.6862Z"
            );

            const path2 = document.createElementNS(svgNS, "path");
            path2.setAttribute("fill", "currentColor");
            path2.setAttribute(
                "d",
                "M7.88777 13.3378C7.85818 13.3576 7.82895 13.3784 7.80012 13.4 7.0845 13.9367 6.83097 14.8609 7.11241 15.6623 6.79435 15.8756 6.4117 16 6 16 4.89543 16 4 15.1046 4 14 4 12.8954 4.89543 12 6 12 6.87248 12 7.61448 12.5587 7.88777 13.3378ZM24.8878 15.6625C25.1693 14.861 24.9158 13.9367 24.2001 13.4 24.1712 13.3783 24.1419 13.3576 24.1123 13.3377 24.3856 12.5586 25.1276 12 26 12 27.1046 12 28 12.8954 28 14 28 15.1046 27.1046 16 26 16 25.5884 16 25.2058 15.8757 24.8878 15.6625ZM9.34896 9.41252C9.13971 9.64051 9.02964 9.94359 8.98156 10.1909 8.87614 10.733 8.3512 11.087 7.80907 10.9816 7.26694 10.8762 6.91291 10.3513 7.01833 9.80913 7.10696 9.35329 7.32826 8.65637 7.87551 8.06013 8.45269 7.4313 9.31564 7 10.4999 7 11.6955 7 12.562 7.45218 13.1357 8.08196 13.6799 8.6794 13.9062 9.37398 13.9852 9.82891 14.0797 10.373 13.7152 10.8908 13.171 10.9853 12.6269 11.0797 12.1092 10.7152 12.0147 10.1711 11.9804 9.97368 11.8753 9.66826 11.6572 9.42878 11.4685 9.22165 11.1417 9 10.4999 9 9.84698 9 9.52829 9.21714 9.34896 9.41252ZM20.3492 9.41252C20.1399 9.64051 20.0299 9.94359 19.9818 10.1909 19.8764 10.733 19.3514 11.087 18.8093 10.9816 18.2672 10.8762 17.9132 10.3513 18.0186 9.80913 18.1072 9.35329 18.3285 8.65637 18.8758 8.06013 19.4529 7.4313 20.3159 7 21.5002 7 22.6957 7 23.5623 7.45218 24.1359 8.08196 24.6802 8.6794 24.9064 9.37398 24.9854 9.82891 25.0799 10.373 24.7154 10.8908 24.1713 10.9853 23.6271 11.0797 23.1094 10.7152 23.0149 10.1711 22.9807 9.97368 22.8756 9.66826 22.6574 9.42878 22.4687 9.22165 22.1419 9 21.5002 9 20.8472 9 20.5285 9.21714 20.3492 9.41252ZM8.40006 14.2C8.84189 13.8686 9.46869 13.9582 9.80006 14.4 10.0981 14.7973 11.7922 16.5 16.0001 16.5 20.2079 16.5 21.9021 14.7973 22.2001 14.4 22.5314 13.9582 23.1582 13.8686 23.6001 14.2 24.0419 14.5314 24.1314 15.1582 23.8001 15.6 23.0981 16.536 20.7922 18.5 16.0001 18.5 11.2079 18.5 8.90206 16.536 8.20006 15.6 7.86869 15.1582 7.95823 14.5314 8.40006 14.2ZM28.9903 19.1395C29.0293 18.8617 28.9519 18.5692 28.7527 18.3415 28.389 17.9259 27.7572 17.8838 27.3416 18.2474L23.5792 21.5396 23.5001 21.5C23.5001 21.0871 23.538 20.7122 23.572 20.375 23.6617 19.4874 23.7249 18.8624 23 18.5 21.6621 17.8312 21.0483 20.0635 20.6367 22.2433 20.5431 22.7391 20.3171 23.1975 20.0649 23.6345 18.7349 25.9384 19.9991 28.2493 21.0001 29 22.7889 30.3417 24.5001 30 26.0001 29 26.9076 28.3951 28.6346 27.1802 29.9273 26.2634 30.4897 25.8645 30.5563 25.0562 30.0688 24.5687 29.7292 24.2291 29.2104 24.1449 28.7808 24.3597L28.6552 24.4225 30.6403 22.7682C31.0646 22.4147 31.1219 21.7841 30.7683 21.3598 30.538 21.0835 30.1902 20.9628 29.8584 21.01L30.1509 20.7593C30.5702 20.3998 30.6188 19.7685 30.2594 19.3492 29.9383 18.9747 29.4004 18.8959 28.9903 19.1395ZM3.01052 19.1395C2.97151 18.8617 3.04896 18.5692 3.24818 18.3415 3.61186 17.9259 4.24363 17.8838 4.65926 18.2474L8.42168 21.5396 8.50076 21.5C8.50076 21.0871 8.46287 20.7121 8.42881 20.375 8.33914 19.4874 8.27599 18.8624 9.00081 18.5 10.3388 17.8312 10.9526 20.0635 11.3641 22.2433 11.4577 22.7391 11.6837 23.1975 11.936 23.6345 13.2659 25.9384 12.0018 28.2493 11.0008 29 9.21191 30.3417 7.50072 30 6.00072 29 5.09329 28.3951 3.36623 27.1802 2.07355 26.2634 1.51116 25.8645 1.44454 25.0562 1.93207 24.5687 2.27167 24.2291 2.79046 24.1449 3.22002 24.3597L3.34567 24.4225 1.36057 22.7682C.936296 22.4147.878972 21.7841 1.23254 21.3598 1.46283 21.0835 1.81065 20.9628 2.14244 21.01L1.84997 20.7593C1.43064 20.3998 1.38208 19.7685 1.7415 19.3492 2.06253 18.9747 2.60047 18.8959 3.01052 19.1395Z"
            );

            svg.appendChild(path1);
            svg.appendChild(path2);
            return svg;
        }

        const icon = document.createElement("i");
        if (iconClass) {
            icon.className = iconClass;
        }
        if (altText) {
            icon.setAttribute("aria-label", altText);
            icon.setAttribute("role", "img");
        }
        return icon;
    }

    function applyLanguageAttributes(lang) {
        const config = LANG_CONFIG[lang] ?? LANG_CONFIG.en;
        document.documentElement.lang = lang;
        document.documentElement.dir = config.dir;
        document.body.classList.toggle("rtl", config.dir === "rtl");
    }

    function updateLanguageToggle() {
        const toggle = document.getElementById("language-toggle");
        if (!toggle) return;
        const config = LANG_CONFIG[currentLanguage] ?? LANG_CONFIG.en;
        toggle.setAttribute("aria-label", config.ariaLabel);
        toggle.setAttribute("title", config.toggleLabel);
        toggle.dataset.lang = currentLanguage;
    }
})();

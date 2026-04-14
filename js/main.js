(function () {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  (function initParallaxBackdrop() {
    var root = document.documentElement;
    var reduceMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      root.style.setProperty("--py-a", "0px");
      root.style.setProperty("--py-b", "0px");
      root.style.setProperty("--py-mesh", "0px");
      return;
    }

    var raf = null;
    function tick() {
      raf = null;
      var y = window.scrollY || window.pageYOffset || 0;
      root.style.setProperty("--py-a", y * -0.11 + "px");
      root.style.setProperty("--py-b", y * -0.2 + "px");
      root.style.setProperty("--py-mesh", y * -0.06 + "px");
    }

    window.addEventListener(
      "scroll",
      function () {
        if (raf != null) return;
        raf = requestAnimationFrame(tick);
      },
      { passive: true }
    );
    tick();
  })();


  function tryLoadPhoto(img) {
    const name = img.dataset.photo;
    if (!name) return;
    const probe = new Image();
    probe.onload = function () {
      img.src = "images/" + name;
    };
    probe.onerror = function () {};
    probe.src = "images/" + name;
  }

  document.querySelectorAll("[data-photo]").forEach(tryLoadPhoto);

  var revealEls = document.querySelectorAll(".reveal[data-reveal]");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  var burger = document.querySelector(".burger");
  var nav = document.querySelector(".nav");
  var navOverlay = document.getElementById("nav-overlay");

  function setNavOpen(open) {
    if (!nav || !burger) return;
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    if (navOverlay) {
      navOverlay.setAttribute("aria-hidden", open ? "false" : "true");
    }
    document.documentElement.classList.toggle("is-nav-open", open);
    document.body.classList.toggle("is-nav-open", open);
  }

  if (burger && nav) {
    burger.addEventListener("click", function () {
      setNavOpen(!nav.classList.contains("is-open"));
    });
    if (navOverlay) {
      navOverlay.addEventListener("click", function () {
        setNavOpen(false);
      });
    }
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        setNavOpen(false);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        setNavOpen(false);
      }
    });
  }

  function isGalleryPhotoFilename(name) {
    if (!name || typeof name !== "string") return false;
    if (!/\.(jpe?g|png|gif|webp)$/i.test(name)) return false;
    if (/^logo/i.test(name.replace(/\.[^.]+$/, ""))) return false;
    return true;
  }

  function humanAlt(filename) {
    var base = filename.replace(/\.[^.]+$/, "");
    return "Пример работы: " + base.replace(/[-_]+/g, " ");
  }

  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightbox-img");
  var lightboxCloseBtn = document.getElementById("lightbox-close");

  function onLightboxKeydown(e) {
    if (e.key === "Escape") {
      closeLightbox();
    }
  }

  function openLightbox(src, alt) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    lightbox.hidden = false;
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("lightbox-open");
    document.addEventListener("keydown", onLightboxKeydown);
    if (lightboxCloseBtn) {
      lightboxCloseBtn.focus();
    }
  }

  function closeLightbox() {
    if (!lightbox || !lightboxImg) return;
    lightbox.hidden = true;
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.removeAttribute("src");
    lightboxImg.alt = "";
    document.body.classList.remove("lightbox-open");
    document.removeEventListener("keydown", onLightboxKeydown);
  }

  if (lightbox) {
    lightbox.addEventListener("click", function (e) {
      if (e.target.closest("[data-lightbox-close]")) {
        closeLightbox();
      }
    });
  }

  function initGallery() {
    var track = document.getElementById("gallery-track");
    var viewport = document.getElementById("gallery-viewport");
    var emptyEl = document.getElementById("gallery-empty");
    if (!track || !viewport) return;

    function bindControls() {
      track.addEventListener("pointerover", function (e) {
        if (e.target.closest(".gallery-marquee__slide")) {
          viewport.classList.add("is-paused");
        }
      });

      track.addEventListener("pointerout", function (e) {
        var next = e.relatedTarget;
        if (next && track.contains(next) && next.closest && next.closest(".gallery-marquee__slide")) {
          return;
        }
        if (!e.target.closest(".gallery-marquee__slide")) return;
        viewport.classList.remove("is-paused");
      });

      track.addEventListener(
        "click",
        function (e) {
          var img = e.target.closest("img");
          if (!img || !e.target.closest(".gallery-marquee__slide")) return;
          e.preventDefault();
          e.stopPropagation();
          openLightbox(img.currentSrc || img.src, img.alt || "");
        },
        true
      );
    }

    function buildFromList(images) {
      track.innerHTML = "";
      var list = images.filter(isGalleryPhotoFilename);
      var isMobile = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches;
      if (!list.length) {
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;

      var forDom = isMobile ? list : list.concat(list);
      forDom.forEach(function (name) {
        var li = document.createElement("li");
        li.className = "gallery-marquee__slide";
        var inner = document.createElement("div");
        inner.className = "gallery-marquee__slide-inner";
        var img = document.createElement("img");
        img.src = "images/" + encodeURIComponent(name);
        img.alt = humanAlt(name);
        img.loading = "lazy";
        img.decoding = "async";
        inner.appendChild(img);
        li.appendChild(inner);
        track.appendChild(li);
      });

      if (!isMobile) {
        var n = list.length;
        var sec = Math.max(40, n * 6.8);
        track.style.setProperty("--marquee-duration", sec + "s");
      } else {
        track.style.removeProperty("--marquee-duration");
      }

      bindControls();
    }

    fetch("data/gallery.json", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : [];
        buildFromList(list);
      })
      .catch(function () {
        buildFromList([]);
      });
  }

  initGallery();

  document.querySelectorAll(".hero__img").forEach(function (img) {
    img.addEventListener("click", function (e) {
      e.preventDefault();
      openLightbox(img.currentSrc || img.src, img.alt || "");
    });
  });

  var form = document.getElementById("order-form");
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("form-submit");

  if (!form || !statusEl || !submitBtn) return;

  var PHONE_PREFIX = "+7 ";

  function phoneLocalDigits(value) {
    var d = String(value || "").replace(/\D/g, "");
    if (!d.length) return "";
    if (d[0] === "8") d = "7" + d.slice(1);
    if (d[0] === "7") d = d.slice(1);
    return d.slice(0, 10);
  }

  function phoneFormat(local10) {
    if (!local10) return PHONE_PREFIX;
    var p = [];
    if (local10.length >= 1) p.push(local10.slice(0, 3));
    if (local10.length > 3) p.push(local10.slice(3, 6));
    if (local10.length > 6) p.push(local10.slice(6, 8));
    if (local10.length > 8) p.push(local10.slice(8, 10));
    return PHONE_PREFIX + p.join(" ");
  }

  function initPhoneMask() {
    var phoneEl = document.getElementById("phone");
    if (!phoneEl) return;

    phoneEl.addEventListener("keydown", function (e) {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      var start = phoneEl.selectionStart;
      var end = phoneEl.selectionEnd;
      if (start === end && start <= PHONE_PREFIX.length) {
        e.preventDefault();
      }
    });

    phoneEl.addEventListener("input", function () {
      var local = phoneLocalDigits(phoneEl.value);
      var next = phoneFormat(local);
      if (phoneEl.value !== next) phoneEl.value = next;
    });

    phoneEl.addEventListener("paste", function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData("text") || "";
      phoneEl.value = phoneFormat(phoneLocalDigits(text));
    });

    phoneEl.addEventListener("focus", function () {
      if (!phoneLocalDigits(phoneEl.value)) phoneEl.value = PHONE_PREFIX;
      requestAnimationFrame(function () {
        var len = phoneEl.value.length;
        phoneEl.setSelectionRange(len, len);
      });
    });
  }

  initPhoneMask();

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.classList.remove("is-error", "is-success");
    if (kind) statusEl.classList.add(kind === "error" ? "is-error" : "is-success");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = (document.getElementById("name") || {}).value;
    var phoneEl = document.getElementById("phone");
    var phone = phoneEl ? phoneEl.value : "";
    var email = (document.getElementById("email") || {}).value;

    var digits = phoneLocalDigits(phone);
    if (digits.length !== 10) {
      setStatus("Введите 10 цифр номера после +7.", "error");
      if (phoneEl) phoneEl.focus();
      return;
    }

    setStatus("");
    submitBtn.disabled = true;
    submitBtn.classList.add("is-loading");

    var endpoint = (form.getAttribute("action") || "").trim();
    if (!endpoint || endpoint.indexOf("formspree.io") === -1 || /REPLACE_WITH_YOUR_ID/.test(endpoint)) {
      setStatus("Форма не настроена. Укажите ссылку Formspree в атрибуте action у формы.", "error");
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-loading");
      return;
    }

    var ac = new AbortController();
    var timeoutMs = 35000;
    var timeoutId = setTimeout(function () {
      ac.abort();
    }, timeoutMs);

    var fd = new FormData(form);
    fd.set("name", String((name || "").trim()));
    fd.set("phone", String((phone || "").trim()));
    fd.set("email", String((email || "").trim()));

    fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: fd,
      signal: ac.signal,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          setStatus("Заявка отправлена. Мы свяжемся с вами в ближайшее время.", "success");
          form.reset();
        } else {
          var err = "Не удалось отправить. Попробуйте позже.";
          if (result.data) {
            if (typeof result.data.error === "string" && result.data.error.trim()) err = result.data.error;
            if (typeof result.data.message === "string" && result.data.message.trim()) err = result.data.message;
          }
          setStatus(err, "error");
        }
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") {
          setStatus("Не удалось отправить: превышено время ожидания. Проверьте интернет и попробуйте ещё раз.", "error");
        } else {
          setStatus("Не удалось отправить: нет связи с сервисом отправки. Проверьте интернет и попробуйте ещё раз.", "error");
        }
      })
      .finally(function () {
        clearTimeout(timeoutId);
        submitBtn.disabled = false;
        submitBtn.classList.remove("is-loading");
      });
  });

  (function initReviews() {
    var listEl = document.getElementById("reviews-list");
    var emptyEl = document.getElementById("reviews-empty");
    var form = document.getElementById("reviews-form");
    if (!listEl || !form) return;

    var STORAGE_KEY = "roofSite.reviews.v1";

    function readLocalReviews() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    }

    function writeLocalReviews(list) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (e) {}
    }

    function fmtDate(iso) {
      try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      } catch (e) {
        return "";
      }
    }

    function buildStars(n) {
      var wrap = document.createElement("div");
      wrap.className = "reviews__stars";
      wrap.setAttribute("aria-label", "Оценка " + String(n) + " из 5");
      var i;
      for (i = 1; i <= 5; i++) {
        var s = document.createElement("span");
        if (i <= n) {
          s.textContent = "★";
        } else {
          s.className = "reviews__stars-muted";
          s.textContent = "★";
        }
        wrap.appendChild(s);
      }
      return wrap;
    }

    function cardFromReview(r) {
      var art = document.createElement("article");
      art.className = "reviews__card";
      var head = document.createElement("div");
      head.className = "reviews__card-head";
      var au = document.createElement("span");
      au.className = "reviews__author";
      au.textContent = r.author || "";
      var dt = document.createElement("time");
      dt.className = "reviews__date";
      dt.dateTime = r.createdAt || "";
      dt.textContent = fmtDate(r.createdAt);
      head.appendChild(au);
      head.appendChild(dt);
      art.appendChild(head);
      var rating = Number(r.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) rating = 5;
      art.appendChild(buildStars(Math.round(rating)));
      var p = document.createElement("p");
      p.className = "reviews__text";
      p.textContent = r.text || "";
      art.appendChild(p);
      return art;
    }

    function setEmptyVisible(show) {
      if (!emptyEl) return;
      if (show) emptyEl.removeAttribute("hidden");
      else emptyEl.setAttribute("hidden", "");
    }

    function renderReviews(items) {
      listEl.textContent = "";
      if (!items || !items.length) {
        setEmptyVisible(true);
        return;
      }
      setEmptyVisible(false);
      items.forEach(function (r) {
        listEl.appendChild(cardFromReview(r));
      });
    }

    var initial = readLocalReviews();
    initial.sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    renderReviews(initial);

    var authorEl = document.getElementById("review-author");
    var ratingEl = document.getElementById("review-rating");
    var textEl = document.getElementById("review-text");
    var statusEl = document.getElementById("reviews-status");
    var submitBtn = document.getElementById("reviews-submit");
    var hp = form.querySelector('input[name="website"]');

    function setRevStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.classList.remove("is-error", "is-success");
      if (kind === "error") statusEl.classList.add("is-error");
      else if (kind === "success") statusEl.classList.add("is-success");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (hp && hp.value && String(hp.value).trim() !== "") {
        return;
      }
      var author = authorEl ? String(authorEl.value || "").trim() : "";
      var text = textEl ? String(textEl.value || "").trim() : "";
      var rating = ratingEl ? Number(ratingEl.value) : 5;
      if (author.length < 2) {
        setRevStatus("Укажите имя (от 2 символов).", "error");
        if (authorEl) authorEl.focus();
        return;
      }
      if (text.length < 10) {
        setRevStatus("Текст отзыва — не менее 10 символов.", "error");
        if (textEl) textEl.focus();
        return;
      }
      if (!submitBtn) return;
      setRevStatus("");
      submitBtn.disabled = true;
      submitBtn.classList.add("is-loading");

      var ac = new AbortController();
      var timeoutId = setTimeout(function () {
        ac.abort();
      }, 20000);

      var list = readLocalReviews();
      var item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
        author: author,
        text: text,
        rating: Math.round(rating),
        createdAt: new Date().toISOString(),
      };
      list.unshift(item);
      writeLocalReviews(list.slice(0, 200));

      setRevStatus("Спасибо! Отзыв опубликован.", "success");
      form.reset();
      if (emptyEl) emptyEl.setAttribute("hidden", "");
      listEl.insertBefore(cardFromReview(item), listEl.firstChild);

      clearTimeout(timeoutId);
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-loading");
    });
  })();
})();

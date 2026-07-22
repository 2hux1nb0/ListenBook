// ===== Header Scroll Effect =====
const header = document.getElementById('header');
let lastScrollY = 0;

window.addEventListener('scroll', () => {
  const currentScrollY = window.scrollY;
  
  if (currentScrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
  
  lastScrollY = currentScrollY;
});

// ===== Mobile Menu Toggle =====
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  mobileMenu.classList.toggle('active');
});

// Close mobile menu when clicking a link
document.querySelectorAll('.mobile-menu-link').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    mobileMenu.classList.remove('active');
  });
});

// ===== Smooth Scroll for Anchor Links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      const headerHeight = document.querySelector('.header').offsetHeight;
      const targetPosition = target.offsetTop - headerHeight - 20;
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// ===== Intersection Observer for Scroll Animations =====
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Add fade-in-up class to elements that should animate
function initScrollAnimations() {
  const animateElements = [
    '.feature-row',
    '.product-card',
    '.testimonial-card',
    '.stats-row',
    '.cta-content'
  ];
  
  animateElements.forEach(selector => {
    document.querySelectorAll(selector).forEach((el, index) => {
      el.classList.add('fade-in-up');
      el.style.transitionDelay = `${index * 0.1}s`;
      observer.observe(el);
    });
  });
}

// ===== Counter Animation =====
function animateCounters() {
  const counters = document.querySelectorAll('.stat-number[data-target]');
  
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseFloat(entry.target.dataset.target);
        const isDecimal = entry.target.dataset.decimal === 'true';
        const duration = 2000;
        const startTime = performance.now();
        
        function updateCounter(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Easing function (ease-out)
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = eased * target;
          
          if (isDecimal) {
            entry.target.textContent = current.toFixed(1);
          } else if (target >= 1000) {
            entry.target.textContent = Math.floor(current / 1000) + 'k';
          } else {
            entry.target.textContent = Math.floor(current);
          }
          
          if (progress < 1) {
            requestAnimationFrame(updateCounter);
          } else {
            if (isDecimal) {
              entry.target.textContent = target.toFixed(1);
            } else if (target >= 1000) {
              entry.target.textContent = '300k';
            } else {
              entry.target.textContent = target;
            }
          }
        }
        
        requestAnimationFrame(updateCounter);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  
  counters.forEach(counter => counterObserver.observe(counter));
}

// ===== Subtitle Mode Toggle =====
function initSubtitleModes() {
  const modeTags = document.querySelectorAll('.mode-tag');
  
  modeTags.forEach(tag => {
    tag.addEventListener('click', () => {
      modeTags.forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
    });
  });
}

// ===== Play Button Toggle =====
function initPlayButton() {
  const playBtn = document.querySelector('.play-btn');
  if (!playBtn) return;
  
  let isPlaying = true;
  
  playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    const icon = playBtn.querySelector('i');
    icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
  });
}

// ===== Vocab Action Buttons =====
function initVocabActions() {
  const vocabBtns = document.querySelectorAll('.vocab-action-btn');
  
  vocabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
      } else {
        btn.classList.add('active');
      }
    });
  });
}

// ===== Progress Bar Animation =====
function initProgressBar() {
  const progressFill = document.querySelector('.progress-fill');
  if (!progressFill) return;
  
  let progress = 45;
  let increasing = true;
  
  setInterval(() => {
    if (increasing) {
      progress += 0.5;
      if (progress >= 100) increasing = false;
    } else {
      progress -= 0.5;
      if (progress <= 0) increasing = true;
    }
    progressFill.style.width = progress + '%';
  }, 100);
}

// ===== Waveform Animation =====
function initWaveform() {
  const waveBars = document.querySelectorAll('.wave-bar');
  
  setInterval(() => {
    waveBars.forEach(bar => {
      const randomHeight = 30 + Math.random() * 70;
      bar.style.height = randomHeight + '%';
    });
  }, 800);
}

// ===== Keyboard Navigation for Sticky Banner =====
function initStickyBanner() {
  const stickyBanner = document.getElementById('stickyBanner');
  
  // Show/hide sticky banner based on scroll position
  window.addEventListener('scroll', () => {
    if (window.innerWidth <= 768) {
      if (window.scrollY > 400) {
        stickyBanner.style.display = 'block';
      } else {
        stickyBanner.style.display = 'none';
      }
    }
  });
  
  // Initially hide on desktop
  if (window.innerWidth > 768) {
    stickyBanner.style.display = 'none';
  }
}

// ===== Initialize Everything =====
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  animateCounters();
  initSubtitleModes();
  initPlayButton();
  initVocabActions();
  initProgressBar();
  initWaveform();
  initStickyBanner();
  
  // Add loaded class for initial animations
  document.body.classList.add('loaded');
});

// Handle resize events
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    initStickyBanner();
  }, 250);
});
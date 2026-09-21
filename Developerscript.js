/**
 * script.js - Portfolio Core Logic
 * Implementa un motore vettoriale per il Canvas e logiche di accessibilità (A11y).
 */

document.addEventListener('DOMContentLoaded', () => {
    
    /* ========================================================
       1. MOTORE FISICO PARTICELLE (HTML5 Canvas Vector System)
    ======================================================== */
    const canvas = document.getElementById('particle-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particlesArray = [];
        
        const isMobile = window.innerWidth < 768;
        const config = {
            numParticles: isMobile ? 45 : 120,
            colorBase: 'rgba(56, 189, 248, 0.6)', 
            lineColor: 'rgba(56, 189, 248, 0.15)',
            maxDistance: 130, 
            mouseRadius: 160  
        };

        let mouse = { x: null, y: null };

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        window.addEventListener('mousemove', (event) => {
            mouse.x = event.x;
            mouse.y = event.y;
        });
        
        window.addEventListener('mouseout', () => {
            mouse.x = null;
            mouse.y = null;
        });

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 1;
                this.speedX = (Math.random() * 1) - 0.5;
                this.speedY = (Math.random() * 1) - 0.5;
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                if (this.x < 0 || this.x > canvas.width) this.speedX = -this.speedX;
                if (this.y < 0 || this.y > canvas.height) this.speedY = -this.speedY;

                if (mouse.x && mouse.y) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < config.mouseRadius) {
                        const forceDirectionX = dx / distance;
                        const forceDirectionY = dy / distance;
                        const force = (config.mouseRadius - distance) / config.mouseRadius;
                        const acceleration = 3; 
                        
                        this.x -= forceDirectionX * force * acceleration;
                        this.y -= forceDirectionY * force * acceleration;
                    }
                }
            }

            draw() {
                ctx.fillStyle = config.colorBase;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();
            }
        }

        function initParticles() {
            particlesArray = [];
            for (let i = 0; i < config.numParticles; i++) {
                particlesArray.push(new Particle());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            for (let i = 0; i < particlesArray.length; i++) {
                particlesArray[i].update();
                particlesArray[i].draw();
                
                for (let j = i; j < particlesArray.length; j++) {
                    let dx = particlesArray[i].x - particlesArray[j].x;
                    let dy = particlesArray[i].y - particlesArray[j].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < config.maxDistance) {
                        let opacity = 1 - (distance / config.maxDistance);
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(56, 189, 248, ${opacity * 0.25})`;
                        ctx.lineWidth = 1;
                        ctx.moveTo(particlesArray[i].x, particlesArray[i].y);
                        ctx.lineTo(particlesArray[j].x, particlesArray[j].y);
                        ctx.stroke();
                        ctx.closePath();
                    }
                }
            }
            requestAnimationFrame(animate);
        }

        initParticles();
        animate();
    }

    /* ========================================================
       2. SCROLL REVEAL (Intersection Observer API)
    ======================================================== */
    const fadeElements = document.querySelectorAll('.fade-in');

    const observerConfig = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15 
    };

    const scrollObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerConfig);

    fadeElements.forEach(element => {
        scrollObserver.observe(element);
    });

    /* ========================================================
       3. LOGICHE MENU MOBILE & ACCESSIBILITA' ARIA
    ======================================================== */
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            const isActive = navLinks.classList.contains('active');
            navLinks.classList.toggle('active');
            mobileBtn.setAttribute('aria-expanded', !isActive);
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                mobileBtn.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* ========================================================
       4. NAVIGAZIONE DINAMICA E SCROLL SPY BASE
    ======================================================== */
    const navbar = document.querySelector('.glass-nav');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 80) {
            navbar.style.background = 'rgba(10, 15, 28, 0.9)';
            navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.5)';
        } else {
            navbar.style.background = 'rgba(10, 15, 28, 0.6)';
            navbar.style.boxShadow = 'none';
        }
    }, { passive: true }); 

    /* ========================================================
       5. LIGHTBOX IMMAGINE PROFILO (Modal)
    ======================================================== */
    const profilePic = document.getElementById('hero-profile-pic');
    const imageModal = document.getElementById('image-modal');
    
    if (profilePic && imageModal) {
        const modalImg = document.getElementById('modal-img');
        const closeModal = document.querySelector('.close-modal-btn');

        const openModal = () => {
            imageModal.classList.add('active');
            modalImg.src = profilePic.src;
            imageModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden'; 
        };

        const chiudiModal = () => {
            imageModal.classList.remove('active');
            imageModal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = 'auto'; 
        };

        profilePic.addEventListener('click', openModal);
        
        profilePic.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal();
            }
        });

        closeModal.addEventListener('click', chiudiModal);

        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) {
                chiudiModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && imageModal.classList.contains('active')) {
                chiudiModal();
            }
        });
    }
});
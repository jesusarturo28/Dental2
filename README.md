
<img width="667" height="1000" alt="WhatsApp Image 2026-04-06 at 10 48 38 AM" src="https://github.com/user-attachments/assets/74938558-d9ce-457f-bb0d-c8d38649a834" />
<img width="736" height="981" alt="WhatsApp Image 2026-04-06 at 10 47 38 AM" src="https://github.com/user-attachments/assets/eb17f47d-7658-4e1b-9f20-43edd4419ef8" />
<img width="736" height="1308" alt="WhatsApp Image 2026-04-06 at 10 47 38 AM (1)" src="https://github.com/user-attachments/assets/5e1ef3e2-263c-443e-8f50-89ea1fecd0c9" />
<img width="736" height="1104" alt="WhatsApp Image 2026-04-06 at 10 47 37 AM" src="https://github.com/user-attachments/assets/af5a6a42-3317-42f6-91f8-3e4d436b89ec" />


https://github.com/user-attachments/assets/b850ba5c-270b-4a0e-97e3-d0708e09e7d7

<img width="1024" height="1024" alt="radiografia" src="https://github.com/user-attachments/assets/a5f9c189-c082-4567-8569-7a549cd4701f" />
<img width="1050" height="531" alt="logo" src="https://github.com/user-attachments/assets/13ca4d7d-6c0a-4530-90fe-8160042d2449" />
<img width="736" height="1104" alt="imagen 3" src="https://github.com/user-attachments/assets/aa8ada0a-9ae9-4dba-8d1f-e4403c0414e5" />
<img width="1024" height="1024" alt="hero_bg" src="https://github.com/user-attachments/assets/126a2569-7cd5-4050-ba5e-6ed8c88e8b0d" />
<img width="1024" height="1024" alt="happy_patient" src="https://github.com/user-attachments/assets/84dd896b-6a3b-405d-bb1b-d411e9b2f250" />


https://github.com/user-attachments/assets/df3956f6-f194-4fc4-a5e4-267a5ec4d650

<img width="1024" height="1024" alt="clinica_moderna" src="https://github.com/user-attachments/assets/c7715b79-400c-433a-b200-336ca031fc93" />
[styles.css](https://github.com/user-attachments/files/27457451/styles.css)

:root {
  --primary-color: #8C52FF; /* Vibrant purple */
  --primary-light: #F0E6FF; /* Soft lilac */
  --secondary-color: #00C2FF; /* Turquoise / Light blue */
  --secondary-dark: #0098CC;
  --bg-light: #ffffff;
  --bg-offset: #FAFAFC;
  --text-dark: #2A2A35;
  --text-light: #6B6B7B;
  --white: #ffffff;
  --shadow-sm: 0 4px 6px -1px rgba(140, 82, 255, 0.05), 0 2px 4px -1px rgba(140, 82, 255, 0.03);
  --shadow-md: 0 10px 15px -3px rgba(140, 82, 255, 0.1), 0 4px 6px -2px rgba(140, 82, 255, 0.05);
  --shadow-lg: 0 20px 25px -5px rgba(140, 82, 255, 0.15), 0 10px 10px -5px rgba(140, 82, 255, 0.04);
  --transition: all 0.3s ease;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: 'Montserrat', system-ui, -apple-system, sans-serif;
}

/* General Animations */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
}

@keyframes heartbeat {
  0% { transform: scale(1); }
  14% { transform: scale(1.15); }
  28% { transform: scale(1); }
  42% { transform: scale(1.15); }
  70% { transform: scale(1); }
  100% { transform: scale(1); }
}

html {
  scroll-behavior: smooth;
}

body {
  color: var(--text-dark);
  background-color: var(--bg-light);
  line-height: 1.6;
}

/* Typography */
h1, h2, h3, h4 {
  font-weight: 700;
  line-height: 1.2;
}

h2 {
  font-size: 2.25rem;
  text-align: center;
  margin-bottom: 2rem;
  color: var(--text-dark);
}

p {
  color: var(--text-light);
  font-size: 1rem;
}

a {
  text-decoration: none;
  color: inherit;
  transition: var(--transition);
}

ul {
  list-style: none;
}

/* Utilities */
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.btn {
  display: inline-block;
  padding: 0.85rem 2rem;
  border-radius: 9999px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
  border: none;
  transition: var(--transition);
}

.btn-primary {
  background-color: var(--primary-color);
  color: var(--white) !important;
  box-shadow: 0 4px 15px rgba(140, 82, 255, 0.4);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(140, 82, 255, 0.6);
  background-color: #7940ED;
}

.btn-secondary {
  background-color: var(--white);
  color: var(--primary-color) !important;
  border: 2px solid var(--primary-color);
  box-shadow: var(--shadow-sm);
}

.btn-secondary:hover {
  background-color: var(--primary-light);
  transform: translateY(-2px);
}

/* Navigation */
header {
  position: fixed;
  top: 0;
  width: 100%;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  z-index: 1000;
  box-shadow: 0 2px 10px rgba(0,0,0,0.03);
}

.nav-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 80px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--primary-color);
}

.logo img {
  height: 50px;
  width: auto;
  border-radius: 50%;
}

.nav-links {
  display: none;
}

@media (min-width: 768px) {
  .nav-links {
    display: flex;
    gap: 2rem;
    align-items: center;
  }
  
  .nav-links a {
    font-weight: 500;
    color: var(--text-dark);
  }
  
  .nav-links a:hover {
    color: var(--primary-color);
  }
  
  .nav-socials {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-left: 1rem;
    padding-left: 2rem;
    border-left: 1px solid #E2E8F0;
  }

  .nav-socials a {
    color: var(--text-light) !important;
    font-size: 1.2rem;
  }

  .nav-socials a:hover {
    color: var(--primary-color) !important;
    transform: translateY(-2px);
  }

  .mobile-menu-btn {
    display: none;
  }
}

.mobile-menu-btn {
  font-size: 1.5rem;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--primary-color);
}

#mobile-menu {
  display: none;
  flex-direction: column;
  background-color: var(--white);
  position: absolute;
  top: 80px;
  left: 0;
  width: 100%;
  padding: 1rem;
  box-shadow: var(--shadow-md);
  border-top: 1px solid #eee;
}

#mobile-menu.active {
  display: flex;
  animation: fadeInUp 0.3s ease-out;
}

#mobile-menu a {
  padding: 1rem;
  font-weight: 500;
  border-bottom: 1px solid #eee;
  text-align: center;
}

.mobile-socials {
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 1.5rem 0;
  border-bottom: 1px solid #eee;
}

.mobile-socials a {
  padding: 0 !important;
  border-bottom: none !important;
  font-size: 1.8rem;
  color: var(--primary-color) !important;
}

/* Hero Section */
.hero {
  position: relative;
  padding: 160px 0 80px;
  min-height: 90vh;
  display: flex;
  align-items: center;
  overflow: hidden;
  background-color: #FAFAFC;
}

.hero-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.hero-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.75);
  z-index: 1;
  pointer-events: none;
}

.hero::before {
  content: "";
  position: absolute;
  top: -10%;
  right: -5%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(0, 194, 255, 0.1) 0%, rgba(255,255,255,0) 70%);
  border-radius: 50%;
  z-index: 0;
}

.hero::after {
  content: "";
  position: absolute;
  bottom: -10%;
  left: -5%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(140, 82, 255, 0.1) 0%, rgba(255,255,255,0) 70%);
  border-radius: 50%;
  z-index: 0;
}

.hero-content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
  animation: fadeInUp 1s ease-out;
}

.hero-tag {
  display: inline-block;
  padding: 0.6rem 1.5rem;
  background-color: var(--primary-light);
  color: var(--primary-color);
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  letter-spacing: 0.5px;
  box-shadow: var(--shadow-sm);
}

.hero h1 {
  font-size: 3.2rem;
  color: var(--text-dark);
  margin-bottom: 1.5rem;
  line-height: 1.1;
}

.hero h1 span {
  color: var(--primary-color);
  position: relative;
  display: inline-block;
}

.hero h1 span::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 8px;
  background-color: rgba(0, 194, 255, 0.3);
  z-index: -1;
  border-radius: 4px;
}

.hero p {
  font-size: 1.2rem;
  margin-bottom: 2.5rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.hero-btns {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .hero h1 {
    font-size: 4.5rem;
  }
}

/* Services */
.services {
  padding: 5rem 0;
  background-color: var(--bg-light);
  position: relative;
}

.section-tag {
  text-align: center;
  color: var(--secondary-color);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
  display: block;
}

.services-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-top: 2rem;
}

@media (min-width: 640px) {
  .services-grid {
    gap: 1.5rem;
  }
}

@media (min-width: 968px) {
  .services-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }
}

.service-card {
  background: var(--white);
  padding: 1.5rem 1rem;
  border-radius: 1.2rem;
  box-shadow: var(--shadow-md);
  text-align: center;
  transition: var(--transition);
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(140, 82, 255, 0.05);
}

@media (min-width: 768px) {
  .service-card {
    padding: 2.5rem 2rem;
    border-radius: 1.5rem;
  }
}

.service-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 6px;
  background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
  opacity: 0;
  transition: var(--transition);
}

.service-card:hover {
  transform: translateY(-10px);
  box-shadow: var(--shadow-lg);
}

.service-card:hover::before {
  opacity: 1;
}

.service-icon {
  width: 55px;
  height: 55px;
  background: var(--primary-light);
  color: var(--primary-color);
  border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  margin: 0 auto 1rem;
  transition: var(--transition);
  animation: float 6s ease-in-out infinite;
}

@media (min-width: 768px) {
  .service-icon {
    width: 80px;
    height: 80px;
    font-size: 2rem;
    margin: 0 auto 1.5rem;
  }
}

.service-icon i {
  animation: heartbeat 2.5s ease-in-out infinite;
}

.service-card:hover .service-icon {
  background-color: var(--primary-color);
  color: var(--white);
  border-radius: 50%;
}

.service-card h3 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: var(--text-dark);
}

.service-card p {
  font-size: 0.85rem;
  line-height: 1.4;
}

@media (min-width: 768px) {
  .service-card h3 {
    font-size: 1.3rem;
    margin-bottom: 1rem;
  }
  
  .service-card p {
    font-size: 1rem;
    line-height: 1.6;
  }
}

/* Educational Section */
.educational {
  padding: 5rem 0;
  background-color: var(--primary-light);
  position: relative;
  border-radius: 0 0 0 0; /* Can be stylized further with SVGs */
}

.edu-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-top: 3rem;
}

@media (min-width: 768px) {
  .edu-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.edu-card {
  background: var(--white);
  padding: 2rem;
  border-radius: 1.2rem;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.edu-card .icon {
  font-size: 2.5rem;
  color: var(--secondary-color);
  margin-bottom: 1rem;
}

.edu-card h4 {
  margin-bottom: 1rem;
  color: var(--primary-color);
  font-size: 1.2rem;
}

/* Trust / Gallery Section */
.gallery {
  padding: 5rem 0;
  background-color: var(--bg-light);
}

.gallery-slider {
  width: 100%;
  max-width: 900px;
  margin: 2rem auto 0;
  padding-bottom: 3.5rem; /* Espacio para los puntitos (pagination) en Swiper */
}

.swiper-slide {
  border-radius: 1.5rem;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  aspect-ratio: 16/9; /* Mejor formato para fotos en carrusel */
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f0f0f0;
}

.swiper-slide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: var(--transition);
}

.swiper-button-next, .swiper-button-prev {
  color: var(--primary-color) !important;
  background: rgba(255, 255, 255, 0.9);
  width: 45px !important;
  height: 45px !important;
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
}

.swiper-button-next:hover, .swiper-button-prev:hover {
  background: var(--primary-color);
  color: var(--white) !important;
}

.swiper-button-next::after, .swiper-button-prev::after {
  font-size: 1.2rem !important;
  font-weight: bold;
}

.swiper-pagination-bullet-active {
  background-color: var(--primary-color) !important;
}

/* Location / Map Section */
.location {
  padding: 5rem 0 2rem;
  background-color: var(--bg-light);
}

.map-container {
  width: 100%;
  border-radius: 1.5rem;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  margin-top: 2rem;
  border: 4px solid var(--white);
  transition: var(--transition);
}

.map-container:hover {
  transform: translateY(-5px);
  box-shadow: 0 25px 30px -5px rgba(140, 82, 255, 0.2);
}

.map-container iframe {
  width: 100%;
  display: block;
  filter: contrast(1.05) opacity(0.9);
  transition: var(--transition);
}

.map-container:hover iframe {
  filter: contrast(1) opacity(1);
}

/* Strong CTA Section */
.cta-section {
  padding: 5rem 0;
  background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
  text-align: center;
  color: var(--white);
  border-radius: 2rem;
  margin: 0 1.5rem 5rem 1.5rem;
  box-shadow: var(--shadow-lg);
  position: relative;
  overflow: hidden;
}

.cta-section h2 {
  color: var(--white);
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.cta-section p {
  color: rgba(255,255,255,0.9);
  font-size: 1.2rem;
  margin-bottom: 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.cta-section .btn-secondary {
  background-color: var(--white);
  color: var(--primary-color) !important;
  border: none;
  font-size: 1.1rem;
  padding: 1rem 2.5rem;
}

.cta-section .btn-secondary:hover {
  background-color: var(--bg-offset);
}

/* Footer */
footer {
  background-color: var(--text-dark);
  color: var(--white);
  padding: 4rem 0 2rem;
  text-align: center;
}

.footer-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  align-items: center;
}

.footer-logo {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--white);
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-logo i {
  color: var(--primary-color);
}

.footer-socials {
  display: flex;
  gap: 1.5rem;
  margin-top: 1rem;
}

.footer-socials a {
  width: 45px;
  height: 45px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
  font-size: 1.2rem;
}

.footer-socials a:hover {
  background-color: var(--primary-color);
  transform: translateY(-3px);
}

.footer-bottom {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
}

/* Floating WhatsApp Button */
.whatsapp-float {
  position: fixed;
  width: 60px;
  height: 60px;
  bottom: 40px;
  right: 40px;
  background-color: #25d366;
  color: #FFF;
  border-radius: 50%;
  text-align: center;
  font-size: 30px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  animation: pulse-green 2s infinite;
}

.whatsapp-float:hover {
  background-color: #128C7E;
}

@keyframes pulse-green {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.7); }
  70% { transform: scale(1.1); box-shadow: 0 0 0 15px rgba(37, 211, 102, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
}

@media (max-width: 768px) {
  .whatsapp-float {
    width: 50px;
    height: 50px;
    bottom: 20px;
    right: 20px;
    font-size: 25px;
  }
}

/* Appointment Form Section */
.appointment-section {
  padding: 5rem 0;
  background-color: var(--bg-offset);
}

.appointment-container {
  max-width: 800px;
  margin: 0 auto;
  background: var(--white);
  padding: 3rem;
  border-radius: 1.5rem;
  box-shadow: var(--shadow-md);
  border: 1px solid rgba(140, 82, 255, 0.05);
}

.appointment-text {
  text-align: center;
  margin-bottom: 2.5rem;
  font-size: 1.1rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.appointment-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
}

@media (min-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-group label {
  font-weight: 600;
  color: var(--text-dark);
  font-size: 0.95rem;
}

.form-control {
  padding: 1rem 1.2rem;
  border: 1px solid #E2E8F0;
  border-radius: 0.8rem;
  font-family: inherit;
  font-size: 1rem;
  color: var(--text-dark);
  transition: var(--transition);
  background-color: #F8FAFC;
}

.form-control:focus {
  outline: none;
  border-color: var(--primary-color);
  background-color: var(--white);
  box-shadow: 0 0 0 3px rgba(140, 82, 255, 0.1);
}

textarea.form-control {
  resize: vertical;
  min-height: 120px;
}

.form-submit {
  margin-top: 1rem;
  width: 100%;
  font-size: 1.1rem;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
}

/* Mobile Responsiveness Improvements */
@media (max-width: 768px) {
  .hero {
    padding: 120px 0 60px;
    min-height: auto;
  }
  
  .hero h1 {
    font-size: 2.4rem;
  }
  
  h2 {
    font-size: 1.8rem;
  }
  
  .appointment-container {
    padding: 1.5rem;
    border-radius: 1rem;
  }
  
  .services, .educational, .gallery, .appointment-section {
    padding: 3rem 0;
  }
  
  .cta-section {
    margin: 0 0 3rem 0;
    padding: 3rem 1.5rem;
    border-radius: 1rem;
  }

  .cta-section h2 {
    font-size: 1.8rem;
  }

  .form-control {
    padding: 0.8rem 1rem;
  }

  .btn {
    padding: 0.8rem 1.5rem;
    width: 100%;
    text-align: center;
  }

  .hero-btns {
    flex-direction: column;
    width: 100%;
  }

  p {
    font-size: 0.95rem;
  }
}


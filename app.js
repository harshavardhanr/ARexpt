import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class VRPassthroughDancer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.xrSession = null;
        this.xrRefSpace = null;
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        this.reticle = null;
        this.platform = null;
        this.dancer = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.isPlaced = false;
        this.controls = null;
        this.preferredMode = 'immersive-vr'; // Will be updated based on device capabilities

        this.init();
    }

    async init() {
        this.setupScene();
        this.setupLights();
        this.createReticle();
        this.createPlatform();
        await this.loadDancer();
        this.setupRenderer();
        this.checkXRSupport();
        this.setupEventListeners();
        this.animate();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        // Set background to null for passthrough transparency
        // Will show dark color in desktop mode, but transparent in VR passthrough
        this.scene.background = null;

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.01,
            100
        );
        this.camera.position.set(0, 1.6, 0);
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 2, 1);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-1, 1, -1);
        this.scene.add(fillLight);
    }

    createReticle() {
        // Make a much larger, more visible reticle
        const geometry = new THREE.RingGeometry(0.15, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            depthTest: true,
            depthWrite: true
        });
        this.reticle = new THREE.Mesh(geometry, material);
        this.reticle.rotation.x = -Math.PI / 2;
        this.reticle.visible = false;
        this.reticle.renderOrder = 1;

        // Add a center dot to make it more visible
        const dotGeometry = new THREE.CircleGeometry(0.05, 32);
        const dotMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
            depthTest: true,
            depthWrite: true
        });
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.rotation.x = -Math.PI / 2;
        this.reticle.add(dot);

        this.scene.add(this.reticle);
        console.log('Reticle created');
    }

    createPlatform() {
        const group = new THREE.Group();

        // Main platform cylinder
        const platformGeometry = new THREE.CylinderGeometry(0.15, 0.18, 0.05, 32);
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0x2c3e50,
            metalness: 0.6,
            roughness: 0.4
        });
        const platformMesh = new THREE.Mesh(platformGeometry, platformMaterial);
        platformMesh.castShadow = true;
        platformMesh.receiveShadow = true;
        group.add(platformMesh);

        // Top surface with different color
        const topGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.01, 32);
        const topMaterial = new THREE.MeshStandardMaterial({
            color: 0x34495e,
            metalness: 0.7,
            roughness: 0.3
        });
        const topMesh = new THREE.Mesh(topGeometry, topMaterial);
        topMesh.position.y = 0.03;
        group.add(topMesh);

        // Edge ring decoration
        const ringGeometry = new THREE.TorusGeometry(0.15, 0.01, 16, 32);
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: 0x3498db,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x3498db,
            emissiveIntensity: 0.2
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.035;
        group.add(ring);

        // Add a bright test sphere to ensure rendering works
        const testSphereGeometry = new THREE.SphereGeometry(0.05, 32, 32);
        const testSphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 1
        });
        const testSphere = new THREE.Mesh(testSphereGeometry, testSphereMaterial);
        testSphere.position.y = 0.15; // Floating above platform
        group.add(testSphere);

        group.visible = false;
        this.platform = group;
        this.scene.add(this.platform);
        console.log('Platform created and added to scene');
    }

    async loadDancer() {
        const loader = new GLTFLoader();
        const statusDiv = document.getElementById('status');

        try {
            statusDiv.textContent = 'Loading dancer model...';

            // Try to load riggedhuman1.glb first
            const gltf = await loader.loadAsync('riggedhuman1.glb');

            this.dancer = gltf.scene;

            // Scale the dancer to fit on the platform (adjust as needed)
            this.dancer.scale.set(0.15, 0.15, 0.15);
            this.dancer.position.y = 0.05;

            // Setup animations if available
            if (gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.dancer);

                // Play all animations (or you can choose specific ones)
                gltf.animations.forEach((clip) => {
                    const action = this.mixer.clipAction(clip);
                    action.play();
                });

                statusDiv.textContent = `Loaded with ${gltf.animations.length} animation(s)`;
            } else {
                // Add a simple rotation animation if no animations exist
                this.dancer.userData.rotate = true;
                statusDiv.textContent = 'Loaded (no animations found, will rotate)';
            }

            this.dancer.visible = false;
            this.platform.add(this.dancer);

            console.log('Dancer loaded successfully and added to platform');
            console.log('Dancer children count:', this.dancer.children.length);

            statusDiv.textContent = 'Ready to enter VR!';

        } catch (error) {
            console.error('Error loading dancer model:', error);
            statusDiv.textContent = 'Error loading model: ' + error.message;

            // Create a simple placeholder if model fails to load
            this.createPlaceholderDancer();
        }
    }

    createPlaceholderDancer() {
        // Create a simple humanoid shape as fallback
        const group = new THREE.Group();

        // Body
        const bodyGeom = new THREE.CapsuleGeometry(0.03, 0.08, 8, 16);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = 0.08;
        group.add(body);

        // Head
        const headGeom = new THREE.SphereGeometry(0.025, 16, 16);
        const head = new THREE.Mesh(headGeom, bodyMat);
        head.position.y = 0.15;
        group.add(head);

        // Arms
        const armGeom = new THREE.CapsuleGeometry(0.01, 0.05, 8, 16);
        const leftArm = new THREE.Mesh(armGeom, bodyMat);
        leftArm.position.set(-0.04, 0.1, 0);
        leftArm.rotation.z = Math.PI / 4;
        group.add(leftArm);

        const rightArm = new THREE.Mesh(armGeom, bodyMat);
        rightArm.position.set(0.04, 0.1, 0);
        rightArm.rotation.z = -Math.PI / 4;
        group.add(rightArm);

        group.scale.set(0.15, 0.15, 0.15);
        group.position.y = 0.05;
        group.userData.rotate = true;
        group.visible = false;

        this.dancer = group;
        this.platform.add(this.dancer);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.xr.enabled = true;
        this.renderer.shadowMap.enabled = true;

        // Ensure proper rendering with passthrough
        this.renderer.autoClear = true;
        this.renderer.sortObjects = true;

        document.body.appendChild(this.renderer.domElement);

        // Add orbit controls for desktop preview
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1, -1);
        this.controls.update();

        console.log('Renderer setup complete');
    }

    async checkXRSupport() {
        const startButton = document.getElementById('startButton');
        const statusDiv = document.getElementById('status');

        if (!navigator.xr) {
            statusDiv.textContent = 'WebXR not supported';
            startButton.disabled = true;
            return;
        }

        try {
            // Check for immersive-ar (MR/passthrough mode) first, then fall back to VR
            const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
            const vrSupported = await navigator.xr.isSessionSupported('immersive-vr');

            if (arSupported) {
                statusDiv.textContent = 'Ready! MR/Passthrough mode available.';
                startButton.disabled = false;
                this.preferredMode = 'immersive-ar';
            } else if (vrSupported) {
                statusDiv.textContent = 'Ready! VR mode (no passthrough).';
                startButton.disabled = false;
                this.preferredMode = 'immersive-vr';
            } else {
                statusDiv.textContent = 'XR not supported on this device';
                startButton.disabled = true;
            }
        } catch (error) {
            console.error('Error checking XR support:', error);
            statusDiv.textContent = 'Error checking XR support';
            startButton.disabled = true;
        }
    }

    setupEventListeners() {
        const startButton = document.getElementById('startButton');
        startButton.addEventListener('click', () => this.startXRSession());

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    async startXRSession() {
        const statusDiv = document.getElementById('status');

        try {
            // Use immersive-ar for passthrough (Quest MR mode) or fall back to immersive-vr
            const sessionMode = this.preferredMode || 'immersive-vr';

            const sessionInit = {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['hit-test', 'hand-tracking', 'layers', 'dom-overlay'],
            };

            // Add DOM overlay if available
            if (sessionInit.optionalFeatures.includes('dom-overlay')) {
                sessionInit.domOverlay = { root: document.body };
            }

            console.log(`Requesting ${sessionMode} session...`);
            this.xrSession = await navigator.xr.requestSession(sessionMode, sessionInit);
            console.log(`${sessionMode} session started successfully`);

            // Setup WebGL layer with alpha for transparency
            const gl = this.renderer.getContext();
            const baseLayer = new XRWebGLLayer(this.xrSession, gl, {
                alpha: true,
                antialias: true
            });

            await this.xrSession.updateRenderState({
                baseLayer: baseLayer
            });

            this.xrRefSpace = await this.xrSession.requestReferenceSpace('local-floor');

            this.xrSession.addEventListener('end', () => this.onSessionEnded());
            this.xrSession.addEventListener('select', (event) => this.onSelect(event));

            this.renderer.xr.setSession(this.xrSession);

            // Ensure scene background is transparent for passthrough
            this.scene.background = null;

            // Keep info panel visible for DOM overlay
            // If DOM overlay is not supported, hide it
            if (!sessionInit.optionalFeatures.includes('dom-overlay')) {
                document.getElementById('info').style.display = 'none';
            }

            // Auto-place dancer in front of user for immediate visibility
            // User can reposition by pointing and clicking
            console.log('XR session started, placing dancer...');
            console.log('Scene children before placement:', this.scene.children.length);
            this.placeAtDefaultPosition();

            console.log('Session mode:', sessionMode);
            console.log('Renderer info:', this.renderer.info);

            if (sessionMode === 'immersive-ar') {
                statusDiv.textContent = 'Passthrough active! Point and click to reposition dancer';
            } else {
                statusDiv.textContent = 'VR Mode - Point and click to reposition dancer';
            }

        } catch (error) {
            console.error('Error starting XR session:', error);
            statusDiv.textContent = 'Error starting VR: ' + error.message;

            // Try fallback to immersive-vr if AR failed
            if (this.preferredMode === 'immersive-ar') {
                console.log('Falling back to immersive-vr...');
                this.preferredMode = 'immersive-vr';
                setTimeout(() => this.startXRSession(), 1000);
            }
        }
    }

    onSessionEnded() {
        this.xrSession = null;
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        document.getElementById('info').style.display = 'block';
        document.getElementById('status').textContent = 'Session ended. Click Enter VR to restart.';
    }

    async onSelect(event) {
        if (this.reticle.visible) {
            // Place or reposition the platform at the reticle position
            this.platform.position.copy(this.reticle.position);
            this.platform.visible = true;
            this.dancer.visible = true;
            this.isPlaced = true;
            console.log('Dancer placed at:', this.reticle.position);
        } else if (!this.isPlaced) {
            // If no reticle but not placed, place at default position
            this.placeAtDefaultPosition();
        }
    }

    async requestHitTestSource() {
        if (this.hitTestSourceRequested) return;
        this.hitTestSourceRequested = true;

        try {
            const session = this.renderer.xr.getSession();
            const viewerSpace = await session.requestReferenceSpace('viewer');
            this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
        } catch (error) {
            console.warn('Hit test not supported:', error);
            // If hit-test fails, place at a default position
            this.placeAtDefaultPosition();
        }
    }

    placeAtDefaultPosition() {
        // Place 1 meter in front and at table height (lower)
        this.platform.position.set(0, 0.3, -1);
        this.platform.visible = true;

        if (this.dancer) {
            this.dancer.visible = true;
            console.log('Dancer visible:', this.dancer.visible, 'at position:', this.platform.position);
        } else {
            console.warn('Dancer not loaded yet!');
        }

        // Don't set isPlaced yet - allow user to reposition with hit-test
        console.log('Platform placed at:', this.platform.position);
        console.log('Platform visible:', this.platform.visible);
        console.log('Platform children count:', this.platform.children.length);
    }

    animate() {
        this.renderer.setAnimationLoop((time, frame) => this.render(time, frame));
    }

    render(time, frame) {
        const delta = this.clock.getDelta();

        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // Simple rotation animation for models without animations
        if (this.dancer && this.dancer.userData.rotate && this.dancer.visible) {
            this.dancer.rotation.y += delta * 0.5;
        }

        // Pulse the reticle to make it more visible
        if (this.reticle && this.reticle.visible) {
            const pulseSpeed = 3;
            const scale = 1 + Math.sin(time / 1000 * pulseSpeed) * 0.2;
            this.reticle.scale.set(scale, scale, scale);
        }

        if (frame && this.xrSession) {
            // VR rendering
            const pose = frame.getViewerPose(this.xrRefSpace);

            // Debug logging every 60 frames (approx once per second at 60fps)
            if (Math.floor(time / 1000) % 1 === 0 && Math.floor(time) % 1000 < 20) {
                console.log('VR frame - Platform visible:', this.platform.visible,
                           'Dancer visible:', this.dancer ? this.dancer.visible : 'no dancer',
                           'Platform pos:', this.platform.position);
            }

            // Always show hit-test reticle for positioning/repositioning
            // Request hit test source if not already requested
            if (!this.hitTestSource && !this.hitTestSourceRequested) {
                this.requestHitTestSource();
            }

            // Perform hit testing
            if (this.hitTestSource && pose) {
                const hitTestResults = frame.getHitTestResults(this.hitTestSource);

                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const hitPose = hit.getPose(this.xrRefSpace);

                    if (hitPose) {
                        this.reticle.visible = true;
                        this.reticle.position.copy(hitPose.transform.position);

                        // Orient reticle to surface
                        const orientation = hitPose.transform.orientation;
                        this.reticle.quaternion.set(
                            orientation.x,
                            orientation.y,
                            orientation.z,
                            orientation.w
                        );
                    }
                } else {
                    this.reticle.visible = false;
                }
            }
        } else {
            // Non-VR rendering (desktop preview)
            this.controls.update();

            // Show platform in preview mode
            if (!this.platform.visible) {
                this.platform.position.set(0, 0, -1);
                this.platform.visible = true;
                this.dancer.visible = true;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    new VRPassthroughDancer();
});

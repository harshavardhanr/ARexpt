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
        this.xButtonPressed = false; // Track X button state
        this.audioListener = null;
        this.positionalAudio = null;
        this.audioLoaded = false;
        this.placard = null;
        this.placardFadeStartTime = null;
        this.raycaster = new THREE.Raycaster();

        this.init();
    }

    async init() {
        this.setupScene();
        this.setupLights();
        this.createReticle();
        this.createPlatform();
        this.setupSpatialAudio();
        this.loadPlacard();
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

        // Add audio listener to camera for spatial audio
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);
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
        // Make a much larger, more visible reticle (scaled to match smaller objects)
        const geometry = new THREE.RingGeometry(0.075, 0.1, 32);
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
        const dotGeometry = new THREE.CircleGeometry(0.025, 32);
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

        // Main platform cylinder (half size)
        const platformGeometry = new THREE.CylinderGeometry(0.075, 0.09, 0.025, 32);
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0x2c3e50,
            metalness: 0.6,
            roughness: 0.4
        });
        const platformMesh = new THREE.Mesh(platformGeometry, platformMaterial);
        platformMesh.castShadow = true;
        platformMesh.receiveShadow = true;
        group.add(platformMesh);

        // Top surface with different color (half size)
        const topGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.005, 32);
        const topMaterial = new THREE.MeshStandardMaterial({
            color: 0x34495e,
            metalness: 0.7,
            roughness: 0.3
        });
        const topMesh = new THREE.Mesh(topGeometry, topMaterial);
        topMesh.position.y = 0.015;
        group.add(topMesh);

        // Edge ring decoration (half size)
        const ringGeometry = new THREE.TorusGeometry(0.075, 0.005, 16, 32);
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: 0x3498db,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x3498db,
            emissiveIntensity: 0.2
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.0175;
        group.add(ring);

        group.visible = false;
        this.platform = group;
        this.scene.add(this.platform);
        console.log('Platform created and added to scene');
    }

    setupSpatialAudio() {
        // Create positional audio that will emanate from the platform
        this.positionalAudio = new THREE.PositionalAudio(this.audioListener);

        // Set up the audio properties for realistic spatial sound
        this.positionalAudio.setRefDistance(0.5); // Distance at which volume is at max
        this.positionalAudio.setRolloffFactor(2); // How quickly sound fades with distance
        this.positionalAudio.setDistanceModel('exponential');
        this.positionalAudio.setVolume(1.0);

        // Load the audio file
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(
            'soundtrack.mp4', // You can name your mp4 file this, or change the filename
            (buffer) => {
                this.positionalAudio.setBuffer(buffer);
                this.positionalAudio.setLoop(true);
                this.audioLoaded = true;
                console.log('Spatial audio loaded successfully');
            },
            (progress) => {
                console.log('Audio loading:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
            },
            (error) => {
                console.warn('Error loading audio:', error);
                console.warn('Make sure soundtrack.mp4 is in the same directory as index.html');
            }
        );

        // Add the audio to the platform so it moves with it
        this.platform.add(this.positionalAudio);
        console.log('Positional audio created and attached to platform');
    }

    loadPlacard() {
        // Load the placard texture
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
            'Placard.png',
            (texture) => {
                // Flip the texture horizontally to invert the image
                texture.repeat.x = -1;
                texture.offset.x = 1;

                // Create a plane geometry sized based on the texture aspect ratio
                const aspectRatio = texture.image.width / texture.image.height;
                const placardHeight = 0.024; // Reduced by 60% (was 0.06, now 40% of original)
                const placardWidth = placardHeight * aspectRatio;

                const geometry = new THREE.PlaneGeometry(placardWidth, placardHeight);
                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    opacity: 0, // Start invisible for fade-in
                    side: THREE.DoubleSide
                });

                this.placard = new THREE.Mesh(geometry, material);

                // Position in front of platform, slightly elevated (original position)
                this.placard.position.set(0, 0.04, 0.08); // Back to original position
                // Don't set rotation here - it will be calculated dynamically to face camera

                this.placard.visible = false; // Hidden until placement
                this.platform.add(this.placard);

                console.log('Placard loaded successfully (60% smaller, texture flipped)');
            },
            undefined,
            (error) => {
                console.warn('Error loading placard:', error);
                console.warn('Make sure Placard.png is in the same directory as index.html');
            }
        );
    }

    async loadDancer() {
        const loader = new GLTFLoader();
        const statusDiv = document.getElementById('status');

        try {
            statusDiv.textContent = 'Loading dancer model...';

            // Try to load riggedhuman1.glb first
            const gltf = await loader.loadAsync('riggedhuman1.glb');

            this.dancer = gltf.scene;

            // Scale the dancer to fit on the platform (half size)
            this.dancer.scale.set(0.075, 0.075, 0.075);
            this.dancer.position.y = 0.025;

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

        group.scale.set(0.075, 0.075, 0.075);
        group.position.y = 0.025;
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
        const startButton = document.getElementById('startButton');

        // Disable button to prevent double-clicks
        startButton.disabled = true;
        statusDiv.textContent = 'Starting VR session...';

        try {
            // End any existing session first
            if (this.xrSession) {
                console.log('Ending existing XR session...');
                await this.xrSession.end();
                this.xrSession = null;
                // Wait a bit for the session to fully close
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Use immersive-ar for passthrough (Quest MR mode) or fall back to immersive-vr
            const sessionMode = this.preferredMode || 'immersive-vr';

            const sessionInit = {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['hit-test', 'hand-tracking', 'dom-overlay'],
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
                statusDiv.textContent = 'Passthrough active! Point and click to place. Press X to reposition.';
            } else {
                statusDiv.textContent = 'VR Mode - Point and click to place. Press X to reposition.';
            }

        } catch (error) {
            console.error('Error starting XR session:', error);
            statusDiv.textContent = 'Error starting VR: ' + error.message;

            // Re-enable button on error
            startButton.disabled = false;

            // Try fallback to immersive-vr if AR failed
            if (this.preferredMode === 'immersive-ar' && !error.message.includes('already an active')) {
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
        this.isPlaced = false;

        // Hide placard
        if (this.placard) {
            this.placard.visible = false;
            this.placard.material.opacity = 0;
            this.placardFadeStartTime = null;
        }

        // Re-enable the button and show UI
        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.disabled = false;
        }

        document.getElementById('info').style.display = 'block';
        document.getElementById('status').textContent = 'Session ended. Click Enter VR to restart.';

        console.log('XR session ended');
    }

    async onSelect(event) {
        if (this.reticle.visible) {
            // Place or reposition the platform at the reticle position
            this.platform.position.copy(this.reticle.position);
            this.platform.visible = true;
            this.dancer.visible = true;
            this.isPlaced = true;
            this.reticle.visible = false; // Hide reticle after placement
            console.log('Dancer placed at:', this.reticle.position);

            // Play spatial audio once placed
            this.playAudio();
        } else if (!this.isPlaced) {
            // If no reticle but not placed, place at default position
            this.placeAtDefaultPosition();
        }
    }

    playAudio() {
        if (this.audioLoaded && this.positionalAudio && !this.positionalAudio.isPlaying) {
            this.positionalAudio.play();
            console.log('Spatial audio started playing');
        } else if (!this.audioLoaded) {
            console.log('Audio not loaded yet');
        }
    }

    showPlacard() {
        if (this.placard && !this.placard.visible) {
            this.placard.visible = true;
            this.placardFadeStartTime = performance.now();
            console.log('Starting placard fade-in');
        }
    }

    hidePlacard() {
        if (this.placard && this.placard.visible) {
            this.placard.visible = false;
            this.placard.material.opacity = 0;
            this.placardFadeStartTime = null;
            console.log('Hiding placard');
        }
    }

    enableRepositioning() {
        // Allow user to reposition the dancer
        this.isPlaced = false;

        // Hide placard during repositioning
        if (this.placard && this.placard.visible) {
            this.hidePlacard();
        }

        console.log('Repositioning enabled');
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

        // Fade in the placard
        if (this.placard && this.placard.visible && this.placardFadeStartTime !== null) {
            const fadeInDuration = 1500; // 1.5 seconds fade in
            const elapsed = performance.now() - this.placardFadeStartTime;
            const progress = Math.min(elapsed / fadeInDuration, 1.0);

            // Smooth easing function
            const easeProgress = progress * (2 - progress); // ease-out

            this.placard.material.opacity = easeProgress;

            if (progress >= 1.0) {
                this.placardFadeStartTime = null; // Stop animating once complete
            }
        }

        // Make placard always face the camera
        if (this.placard && this.placard.visible) {
            // Get camera position in world space
            const cameraWorldPos = new THREE.Vector3();
            this.camera.getWorldPosition(cameraWorldPos);

            // Convert camera position to platform's local space
            const cameraLocalPos = this.platform.worldToLocal(cameraWorldPos.clone());

            // Calculate direction from placard to camera in local space
            const direction = new THREE.Vector3();
            direction.subVectors(cameraLocalPos, this.placard.position);
            direction.y = 0; // Keep placard upright
            direction.normalize();

            // Calculate rotation angle in local space
            const angle = Math.atan2(direction.x, direction.z);

            // Apply rotation with 180 degree offset around center
            this.placard.rotation.y = angle + Math.PI;
        }

        if (frame && this.xrSession) {
            // VR rendering
            const pose = frame.getViewerPose(this.xrRefSpace);

            // Check for X button press on controllers
            const inputSources = this.xrSession.inputSources;
            let xButtonCurrentlyPressed = false;

            for (const inputSource of inputSources) {
                if (inputSource.gamepad) {
                    // Button 4 is typically X on left controller or A on right controller
                    // Button 5 is typically Y on left controller or B on right controller
                    if (inputSource.gamepad.buttons[4] && inputSource.gamepad.buttons[4].pressed) {
                        xButtonCurrentlyPressed = true;
                        break;
                    }
                    if (inputSource.gamepad.buttons[5] && inputSource.gamepad.buttons[5].pressed) {
                        xButtonCurrentlyPressed = true;
                        break;
                    }
                }
            }

            // Detect button press (not held) and enable repositioning
            if (xButtonCurrentlyPressed && !this.xButtonPressed) {
                console.log('X button pressed - enabling repositioning');
                this.enableRepositioning();
            }
            this.xButtonPressed = xButtonCurrentlyPressed;

            // Check if controller is pointing at platform and show/hide placard
            if (this.isPlaced && this.platform.visible) {
                let pointingAtPlatform = false;

                for (const inputSource of inputSources) {
                    if (inputSource.targetRayMode === 'tracked-pointer' && inputSource.targetRaySpace) {
                        // Get the controller pose
                        const controllerPose = frame.getPose(inputSource.targetRaySpace, this.xrRefSpace);

                        if (controllerPose) {
                            // Get controller position and direction
                            const transform = controllerPose.transform;
                            const origin = new THREE.Vector3(
                                transform.position.x,
                                transform.position.y,
                                transform.position.z
                            );

                            // Calculate direction from orientation
                            const orientation = transform.orientation;
                            const direction = new THREE.Vector3(0, 0, -1);
                            direction.applyQuaternion(new THREE.Quaternion(
                                orientation.x,
                                orientation.y,
                                orientation.z,
                                orientation.w
                            ));

                            // Set up raycaster
                            this.raycaster.set(origin, direction);

                            // Check intersection with platform and its children
                            const intersects = this.raycaster.intersectObjects(this.platform.children, true);

                            if (intersects.length > 0) {
                                pointingAtPlatform = true;
                                break;
                            }
                        }
                    }
                }

                // Show/hide placard based on pointing
                if (pointingAtPlatform) {
                    if (!this.placard.visible) {
                        this.showPlacard();
                    }
                } else {
                    if (this.placard.visible) {
                        this.hidePlacard();
                    }
                }
            }

            // Debug logging every 60 frames (approx once per second at 60fps)
            if (Math.floor(time / 1000) % 1 === 0 && Math.floor(time) % 1000 < 20) {
                console.log('VR frame - Platform visible:', this.platform.visible,
                           'Dancer visible:', this.dancer ? this.dancer.visible : 'no dancer',
                           'Platform pos:', this.platform.position);
            }

            // Show hit-test reticle only when not placed
            if (!this.isPlaced) {
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
                // Hide reticle when already placed
                this.reticle.visible = false;
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

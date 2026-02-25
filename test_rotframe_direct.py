import numpy as np
import matplotlib.pyplot as plt

def bloch_rhs_rotating(M, B1x, B1y=0, T1=np.inf, T2=np.inf, M0=-1):
    """Bloch equations directly in the rotating frame (on-resonance)"""
    dMx = -M[1] * 0 + M[2] * B1y - M[0] / T2  # no detuning (omega=0 in rot frame)
    dMy = M[0] * 0 - M[2] * B1x - M[1] / T2
    dMz = M[1] * B1x - M[0] * B1y - (M[2] - M0) / T1
    return np.array([dMx, dMy, dMz])

def rk4_step(M, B1x, B1y, dt, T1, T2, M0):
    k1 = bloch_rhs_rotating(M, B1x, B1y, T1, T2, M0)
    k2 = bloch_rhs_rotating(M + 0.5 * dt * k1, B1x, B1y, T1, T2, M0)
    k3 = bloch_rhs_rotating(M + 0.5 * dt * k2, B1x, B1y, T1, T2, M0)
    k4 = bloch_rhs_rotating(M + dt * k3, B1x, B1y, T1, T2, M0)
    return M + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4)

def main():
    # In rotating frame, B1 is static along x-axis for on-resonance drive
    B1x = np.pi  # Rabi frequency
    B1y = 0
    dt = 1e-4
    tmax = 2.0  # longer time to see full Rabi cycle
    times = np.arange(0, tmax, dt)
    # Start with magnetization at 45° in x-y plane, slightly tipped from equator
    M = np.array([0.7, 0.7, -0.1])  # well-defined phi, not aligned with drive
    M = M / np.linalg.norm(M)  # normalize
    T1 = T2 = 1e6
    M0 = -1.0
    
    Ms = []
    phis = []
    rhos = []
    for t in times:
        M = rk4_step(M, B1x, B1y, dt, T1, T2, M0)
        phi = np.arctan2(M[1], M[0])
        rho = np.hypot(M[0], M[1])
        phis.append(phi)
        rhos.append(rho)
        Ms.append(M.copy())
    
    Ms = np.array(Ms)
    phis_raw = np.array(phis)
    
    # Print phi statistics (raw only, no unwrap needed if truly constant)
    print(f"Rotating frame phi statistics (integrated directly in rotating frame):")
    print(f"  Mean: {np.mean(phis_raw):.6f} rad = {np.mean(phis_raw)*180/np.pi:.2f}°")
    print(f"  Std dev: {np.std(phis_raw):.6e} rad")
    print(f"  Min: {np.min(phis_raw):.6f} rad")
    print(f"  Max: {np.max(phis_raw):.6f} rad")
    print(f"  Range: {np.max(phis_raw) - np.min(phis_raw):.6e} rad")
    print(f"\nFor on-resonance drive in rotating frame, phi should be constant.")
    
    plt.figure(figsize=(12, 4))
    plt.subplot(131)
    plt.plot(times, Ms[:, 2], label='Mz')
    plt.plot(times, rhos, label='ρ (transverse)')
    plt.xlabel('Time (s)')
    plt.ylabel('Magnetization')
    plt.legend()
    plt.title('Rabi Oscillations (Rotating Frame)')
    plt.grid(True, alpha=0.3)
    
    plt.subplot(132)
    plt.plot(times, phis_raw * 180 / np.pi)
    plt.xlabel('Time (s)')
    plt.ylabel('φ (degrees)')
    plt.title('Azimuthal Angle φ')
    plt.grid(True, alpha=0.3)
    
    plt.subplot(133)
    # 3D trajectory
    from mpl_toolkits.mplot3d import Axes3D
    ax = plt.subplot(133, projection='3d')
    ax.plot(Ms[:, 0], Ms[:, 1], Ms[:, 2], 'b-', linewidth=0.5)
    ax.scatter([Ms[0, 0]], [Ms[0, 1]], [Ms[0, 2]], c='g', s=50, label='start')
    ax.scatter([Ms[-1, 0]], [Ms[-1, 1]], [Ms[-1, 2]], c='r', s=50, label='end')
    ax.set_xlabel('Mx')
    ax.set_ylabel('My')
    ax.set_zlabel('Mz')
    ax.set_title('Bloch Vector Trajectory')
    ax.legend()
    
    plt.tight_layout()
    plt.savefig('rotframe_direct_test.png', dpi=150)
    print(f"\nPlot saved to rotframe_direct_test.png")

if __name__ == '__main__':
    main()

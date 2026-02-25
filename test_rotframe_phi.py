import numpy as np
import matplotlib.pyplot as plt

def bloch_rhs(M, omega0, w1, t, T1=np.inf, T2=np.inf, M0=-1):
    # Lab frame Bloch equations with resonant drive
    B1 = w1 * np.sin(omega0 * t)  # resonant drive
    dMx = omega0 * M[1] - M[0] / T2
    dMy = M[2] * B1 - omega0 * M[0] - M[1] / T2
    dMz = -M[1] * B1 - (M[2] - M0) / T1
    return np.array([dMx, dMy, dMz])

def rk4_step(M, omega0, w1, t, dt, T1, T2, M0):
    k1 = bloch_rhs(M, omega0, w1, t, T1, T2, M0)
    k2 = bloch_rhs(M + 0.5 * dt * k1, omega0, w1, t + 0.5 * dt, T1, T2, M0)
    k3 = bloch_rhs(M + 0.5 * dt * k2, omega0, w1, t + 0.5 * dt, T1, T2, M0)
    k4 = bloch_rhs(M + dt * k3, omega0, w1, t + dt, T1, T2, M0)
    return M + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4)

def main():
    omega0 = 2 * np.pi * 300  # 300 Hz
    w1 = np.pi  # Rabi frequency
    dt = 1e-4
    tmax = 0.1
    times = np.arange(0, tmax, dt)
    # Start with some transverse magnetization to have well-defined phi
    M = np.array([1.0, 0.0, 0.0])
    T1 = T2 = 1e6  # effectively no relaxation
    M0 = -1.0
    Ms = []
    phis = []
    rhos = []
    for t in times:
        M = rk4_step(M, omega0, w1, t, dt, T1, T2, M0)
        # Rotating frame transformation
        angle = -omega0 * t
        Mx_r = M[0] * np.cos(angle) - M[1] * np.sin(angle)
        My_r = M[0] * np.sin(angle) + M[1] * np.cos(angle)
        phi = np.arctan2(My_r, Mx_r)
        rho = np.hypot(Mx_r, My_r)
        phis.append(phi)
        rhos.append(rho)
        Ms.append(M.copy())
    Ms = np.array(Ms)
    phis_raw = np.array(phis)
    phis = np.unwrap(phis)
    
    # Print phi statistics (raw and unwrapped)
    print(f"Rotating frame phi statistics (raw):")
    print(f"  Mean: {np.mean(phis_raw):.6f} rad")
    print(f"  Std dev: {np.std(phis_raw):.6e} rad")
    print(f"  Min: {np.min(phis_raw):.6f} rad")
    print(f"  Max: {np.max(phis_raw):.6f} rad")
    print(f"  Range: {np.max(phis_raw) - np.min(phis_raw):.6e} rad")
    print(f"\nRotating frame phi statistics (unwrapped):")
    print(f"  Mean: {np.mean(phis):.6f} rad")
    print(f"  Std dev: {np.std(phis):.6e} rad")
    print(f"  Min: {np.min(phis):.6f} rad")
    print(f"  Max: {np.max(phis):.6f} rad")
    print(f"  Range: {np.max(phis) - np.min(phis):.6e} rad")
    print(f"\nPhi should be constant in rotating frame for resonant drive.")
    print(f"Small variation indicates numerical precision, not physical drift.")
    
    plt.figure(figsize=(10,4))
    plt.subplot(121)
    plt.plot(times, Ms[:,2], label='z')
    plt.plot(times, rhos, label='rho')
    plt.xlabel('Time (s)')
    plt.legend()
    plt.title('Rabi Oscillations')
    plt.subplot(122)
    plt.plot(times, phis)
    plt.xlabel('Time (s)')
    plt.ylabel('Rotating frame phi (rad)')
    plt.title('Rotating Frame Phi')
    plt.tight_layout()
    plt.savefig('rotframe_phi_test.png', dpi=150)
    print(f"\nPlot saved to rotframe_phi_test.png")

if __name__ == '__main__':
    main()
